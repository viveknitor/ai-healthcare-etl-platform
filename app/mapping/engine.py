"""Deterministic mapping executor. AI proposes configs; only this code runs them on real data."""
import copy
import re
from datetime import datetime
from typing import Any

from .models import MappingConfig

_TOKEN = re.compile(r"([^.\[\]]+)|\[(\d+)\]")
MISSING = object()


class MappingNotApproved(Exception):
    pass


class MappingError(Exception):
    pass


def parse_path(path: str) -> list[str | int]:
    return [int(m.group(2)) if m.group(2) is not None else m.group(1) for m in _TOKEN.finditer(path)]


def get_path(obj: Any, path: str) -> Any:
    cur = obj
    for tok in parse_path(path):
        try:
            cur = cur[tok]
        except (KeyError, IndexError, TypeError):
            return MISSING
    return cur


def set_path(obj: dict, path: str, value: Any) -> None:
    toks = parse_path(path)
    cur: Any = obj
    for i, tok in enumerate(toks):
        last = i == len(toks) - 1
        nxt = None if last else toks[i + 1]
        if isinstance(tok, int):
            while len(cur) <= tok:
                cur.append(None)
            if last:
                cur[tok] = value
            else:
                if cur[tok] is None:
                    cur[tok] = [] if isinstance(nxt, int) else {}
                cur = cur[tok]
        else:
            if last:
                cur[tok] = value
            else:
                cur = cur.setdefault(tok, [] if isinstance(nxt, int) else {})


_COMMON_DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S.%f",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%fZ",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d",
    "%m/%d/%Y %H:%M:%S",
    "%m/%d/%Y",
    "%d/%m/%Y",
    "%Y/%m/%d",
    "%Y%m%d",
    "%d-%m-%Y",
    "%b %d, %Y",
    "%B %d, %Y",
]


def _date(v: Any, args: dict) -> str:
    """Robust, dynamic date parser that automatically normalizes SQL Server, ISO, US,
    and arbitrary date/datetime strings to standard FHIR date format (YYYY-MM-DD)."""
    if v is None:
        return ""
    s = str(v).strip()
    if not s:
        return ""

    to_fmt = args.get("to", "%Y-%m-%d")
    from_fmt = args.get("from")

    # If explicit 'from' format was specified in rule
    if from_fmt:
        # First try exact match
        try:
            return datetime.strptime(s, from_fmt).strftime(to_fmt)
        except ValueError:
            pass
        # If 'from' is %Y-%m-%d, also accept SQL Server / ISO datetime strings starting with YYYY-MM-DD
        if from_fmt == "%Y-%m-%d":
            m = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})", s)
            if m:
                y, mon, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
                return f"{y:04d}-{mon:02d}-{d:02d}"
        raise MappingError(f"date {s!r} does not match expected format {from_fmt!r}")

    # No explicit 'from' specified -> fully dynamic detection
    # 1. Fast regex for ISO / SQL Server timestamps: '1988-04-12 00:00:00.000', '1988-04-12T00:00:00', '1988/04/12'
    m_iso = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})", s)
    if m_iso:
        y, mon, d = int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3))
        return f"{y:04d}-{mon:02d}-{d:02d}"

    # 2. Fast regex for US format: '04/12/1988 00:00:00' or '04-12-1988'
    m_us = re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})", s)
    if m_us:
        mon, d, y = int(m_us.group(1)), int(m_us.group(2)), int(m_us.group(3))
        return f"{y:04d}-{mon:02d}-{d:02d}"

    # 3. Standard fromisoformat
    try:
        clean_iso = s.replace("Z", "+00:00")
        return datetime.fromisoformat(clean_iso).strftime(to_fmt)
    except Exception:
        pass

    # 4. Formats fallback
    for fmt in _COMMON_DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).strftime(to_fmt)
        except Exception:
            pass

    raise MappingError(f"cannot parse date {s!r}")


def _map(v: Any, args: dict) -> Any:
    table = {str(k).lower(): val for k, val in args.items() if k != "default"}
    key = str(v).strip().lower()
    if key in table:
        return table[key]
    if "default" in args:
        return args["default"]
    raise MappingError(f"no mapping for value {v!r}")


TRANSFORMS = {
    "direct": lambda v, a: v,
    "date": _date,
    "map": _map,
    "upper": lambda v, a: str(v).upper(),
    "lower": lambda v, a: str(v).lower(),
    "strip": lambda v, a: str(v).strip(),
}


_IDENTIFIER_SYSTEM_MAP = {
    "ssn": ("http://hl7.org/fhir/sid/us-ssn", "SSN"),
    "memid": ("http://hospital.smarthealth.org/member-id", "Member ID"),
    "member_id": ("http://hospital.smarthealth.org/member-id", "Member ID"),
    "entityid": ("http://hospital.smarthealth.org/entity-id", "Entity ID"),
    "umin": ("http://hospital.smarthealth.org/umin", "UMIN"),
    "secondaryid": ("http://hospital.smarthealth.org/secondary-id", "Secondary ID"),
    "enterpriseid": ("http://hospital.smarthealth.org/enterprise-id", "Enterprise ID"),
    "externalid": ("http://hospital.smarthealth.org/external-id", "External ID"),
}


def apply_mapping(cfg: MappingConfig, payload: dict, require_approved: bool = True) -> tuple[dict, list[str]]:
    """Returns (resource, errors). Errors are per-field so one bad value doesn't hide the rest."""
    if require_approved and cfg.status != "approved":
        raise MappingNotApproved(f"mapping '{cfg.name}' v{cfg.version} is '{cfg.status}', not approved")
    out: dict = {"resourceType": cfg.target_resource}
    errors: list[str] = []
    for path, val in cfg.constants.items():
        set_path(out, path, copy.deepcopy(val))
    for rule in cfg.rules:
        value = get_path(payload, rule.source)
        if value is MISSING or value in (None, ""):
            if rule.required:
                errors.append(f"missing required source field '{rule.source}'")
            continue
        fn = TRANSFORMS.get(rule.transform)
        if fn is None:
            errors.append(f"unknown transform '{rule.transform}' on '{rule.source}'")
            continue
        try:
            val = fn(value, rule.args)
            set_path(out, rule.target, val)
            # Auto-inject valid FHIR R4 extension URL if mapping to an extension value
            m = re.match(r"^(.*extension\[\d+\])\.value\w+$", rule.target)
            if m:
                url_path = f"{m.group(1)}.url"
                if get_path(out, url_path) in (MISSING, None, ""):
                    set_path(out, url_path, f"urn:source:extension:{rule.source}")
            # Auto-inject standard system URI and human-readable label for identifiers
            m_id = re.match(r"^identifier\[(\d+)\]\.value$", rule.target)
            if m_id:
                idx = int(m_id.group(1))
                sys_path = f"identifier[{idx}].system"
                type_path = f"identifier[{idx}].type.text"
                if get_path(out, sys_path) in (MISSING, None, ""):
                    uri, label = _IDENTIFIER_SYSTEM_MAP.get(
                        rule.source.lower(),
                        (f"http://hospital.smarthealth.org/{rule.source.lower()}", rule.source.upper())
                    )
                    set_path(out, sys_path, uri)
                    set_path(out, type_path, label)
        except Exception as e:  # noqa: BLE001 - report, don't crash the batch
            errors.append(f"'{rule.source}' -> '{rule.target}' ({rule.transform}): {e}")
    compacted = _compact(out)
    sanitized = _sanitize_extensions(compacted)
    return sanitized, errors


def _sanitize_extensions(node: Any, default_prefix: str = "urn:source:extension") -> Any:
    """Ensure all FHIR extensions have a non-empty 'url', correct JSON primitive types, and prune empty extensions."""
    if isinstance(node, dict):
        if "extension" in node and isinstance(node["extension"], list):
            cleaned = []
            for idx, ext in enumerate(node["extension"]):
                if isinstance(ext, dict):
                    # Coerce JSON primitive types on extension values
                    for k, v in list(ext.items()):
                        if k == "valueDecimal" and isinstance(v, str):
                            try:
                                ext[k] = float(v) if "." in v else int(v)
                            except ValueError:
                                pass
                        elif k in ("valueInteger", "valuePositiveInt", "valueUnsignedInt") and isinstance(v, str):
                            try:
                                ext[k] = int(float(v))
                            except ValueError:
                                pass
                        elif k == "valueBoolean" and isinstance(v, str):
                            ext[k] = v.lower() in ("true", "1", "yes", "y", "t")

                    has_val = any(k.startswith("value") or k == "extension" for k in ext.keys())
                    if has_val:
                        if not ext.get("url"):
                            ext["url"] = f"{default_prefix}:field-{idx + 1}"
                        cleaned.append(_sanitize_extensions(ext, default_prefix))
            if cleaned:
                node["extension"] = cleaned
            else:
                node.pop("extension", None)
        for k, v in list(node.items()):
            if k != "extension":
                if k in ("multipleBirthBoolean", "active") and isinstance(v, str):
                    node[k] = v.lower() in ("true", "1", "yes", "y", "t")
                elif k in ("multipleBirthInteger",) and isinstance(v, str):
                    try:
                        node[k] = int(float(v))
                    except ValueError:
                        pass
                node[k] = _sanitize_extensions(v, default_prefix)
    elif isinstance(node, list):
        return [_sanitize_extensions(x, default_prefix) for x in node if x is not None]
    return node


def _compact(o: Any) -> Any:
    """Drop None placeholders left by sparse list indexes."""
    if isinstance(o, dict):
        return {k: _compact(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_compact(v) for v in o if v is not None]
    return o
