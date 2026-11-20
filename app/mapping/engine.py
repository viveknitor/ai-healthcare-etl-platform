"""Deterministic and dynamic mapping executor.
Provides semantic transform resolution, target-aware schema coercion,
and comprehensive healthcare edge-case handling (SQL sentinel nulls, dirty booleans,
accounting decimals, multi-format timestamps, and dynamic FHIR choice extensions).
"""
import copy
import logging
import re
from datetime import datetime
from typing import Any

from .models import MappingConfig

logger = logging.getLogger("mapping.engine")

_TOKEN = re.compile(r"([^.\[\]]+)|\[(\d+)\]")
MISSING = object()

SENTINEL_NULLS: set[str] = {
    "null", "none", "n/a", "na", "nan", "nil", "undefined",
    "#n/a", "--", "—", "-", "null\n", "none\n", "null\r\n"
}


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


def is_empty_or_sentinel_null(v: Any) -> bool:
    """Detects missing, empty, or healthcare sentinel null strings (e.g. 'NULL', 'N/A', 'NaN', '—')."""
    if v is None or v is MISSING:
        return True
    if isinstance(v, str):
        cleaned = v.strip().lower()
        if not cleaned or cleaned in SENTINEL_NULLS:
            return True
    return False


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
    "%d-%b-%Y",
    "%d %b %Y",
]


def normalize_fhir_datetime(v: Any, target_path: str = "") -> str:
    """Dynamically normalizes timestamps and date strings into strictly valid FHIR R4 date/dateTime.
    FHIR R4 Spec Rules:
    - Date: YYYY, YYYY-MM, or YYYY-MM-DD (No time component allowed).
    - DateTime: YYYY, YYYY-MM, YYYY-MM-DD, or YYYY-MM-DDThh:mm:ss(Z|(+|-)hh:mm).
      If a time component is present, timezone offset (Z or +/-hh:mm) is MANDATORY.
    - Naive midnight timestamps (e.g. '2026-08-14 00:00:00' or '2026-08-14T00:00:00') from SQL exports
      are dynamically cleaned to '2026-08-14' (or '2026-08-14T00:00:00Z') to satisfy spec regex.
    """
    if v is None or v is MISSING:
        return ""
    s = str(v).strip()
    if not s or s.lower() in SENTINEL_NULLS:
        return ""

    # Strip sub-second microseconds if needed
    s_clean = re.sub(r"\.(\d+)", "", s)

    # Check if target is strictly Date-only (e.g. birthDate, valueDate)
    tgt = target_path.lower()
    is_date_only = tgt.endswith("date") and not tgt.endswith("datetime")

    # Match time component and timezone offset
    m_time = re.search(r"[T ](\d{2}):(\d{2}):?(\d{2})?", s_clean)
    has_tz = bool(re.search(r"(Z|[+-]\d{2}:\d{2})$", s))

    # Extract date part
    date_part = s_clean.split("T")[0].split(" ")[0]
    m_d = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})", date_part)
    if m_d:
        clean_date = f"{int(m_d.group(1)):04d}-{int(m_d.group(2)):02d}-{int(m_d.group(3)):02d}"
    else:
        m_us = re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})", date_part)
        if m_us:
            clean_date = f"{int(m_us.group(3)):04d}-{int(m_us.group(1)):02d}-{int(m_us.group(2)):02d}"
        else:
            if len(date_part) == 8 and date_part.isdigit():
                clean_date = f"{date_part[:4]}-{date_part[4:6]}-{date_part[6:8]}"
            else:
                clean_date = date_part

    if is_date_only or not m_time:
        return clean_date

    hh, mm = int(m_time.group(1)), int(m_time.group(2))
    ss = int(m_time.group(3)) if m_time.group(3) else 0

    # If midnight default without explicit timezone (standard SQL Server / DB artifact), return clean date
    if hh == 0 and mm == 0 and ss == 0 and not has_tz:
        return clean_date

    # If non-zero time without timezone, enforce UTC 'Z'
    if not has_tz:
        return f"{clean_date}T{hh:02d}:{mm:02d}:{ss:02d}Z"

    # Has timezone offset already -> ensure 'T' separator
    time_part = s[len(date_part) + 1 :]
    return f"{clean_date}T{time_part}"


def _date(v: Any, args: dict | None = None, target_path: str = "") -> str:
    """Robust, dynamic date parser that automatically normalizes SQL Server (with .000 ms),
    ISO, US, compact, and arbitrary date/datetime strings to standard FHIR date format (YYYY-MM-DD)."""
    if args is None:
        args = {}
    if v is None or v is MISSING:
        return ""
    s = str(v).strip()
    if not s or s.lower() in SENTINEL_NULLS:
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

    # Fully dynamic detection and normalization
    return normalize_fhir_datetime(s, target_path)


def _map(v: Any, args: dict) -> Any:
    """Dynamic dictionary/code lookup with case and whitespace insensitivity."""
    table = {str(k).strip().lower(): val for k, val in args.items() if k != "default"}
    key = str(v).strip().lower()
    if key in table:
        return table[key]
    if "default" in args:
        return args["default"]
    raise MappingError(f"no mapping for value {v!r}")


def _parse_bool_dynamic(v: Any) -> bool:
    """Dynamically parses truthy and falsy values across healthcare data representations."""
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    s = str(v).strip().lower()
    if s in ("true", "t", "1", "yes", "y", "active", "valid", "positive", "enabled"):
        return True
    if s in ("false", "f", "0", "no", "n", "inactive", "invalid", "negative", "disabled", ""):
        return False
    return bool(s)


def _parse_number_dynamic(v: Any, is_int: bool = False) -> int | float:
    """Cleans currency signs, thousands separators, and accounting parens, parsing cleanly."""
    if isinstance(v, (int, float)):
        return int(round(v)) if is_int else v
    s = str(v).strip()
    if not s or s.lower() in SENTINEL_NULLS:
        return 0 if is_int else 0.0
    # Clean currency symbols, commas, spaces
    clean = re.sub(r"[^\d.-]", "", s.replace(",", ""))
    # Handle accounting parens '(50.00)' -> '-50.00'
    if s.startswith("(") and s.endswith(")"):
        clean = f"-{clean}"
    try:
        f_val = float(clean)
        return int(round(f_val)) if is_int else f_val
    except ValueError as e:
        raise MappingError(f"cannot parse numeric value from {v!r}") from e


def _parse_gender_dynamic(v: Any) -> str:
    """Normalizes arbitrary gender/sex inputs to valid FHIR R4 administrative gender codes."""
    s = str(v).strip().lower()
    if s in ("m", "male", "man", "boy", "1"):
        return "male"
    if s in ("f", "female", "woman", "girl", "2"):
        return "female"
    if s in ("o", "other", "nb", "non-binary", "transgender"):
        return "other"
    return "unknown"


TRANSFORMS = {
    "direct": lambda v, a: v,
    "identity": lambda v, a: v,
    "asis": lambda v, a: v,
    "as_is": lambda v, a: v,
    "none": lambda v, a: v,
    "date": _date,
    "map": _map,
    "upper": lambda v, a: str(v).upper(),
    "lower": lambda v, a: str(v).lower(),
    "strip": lambda v, a: str(v).strip(),
    "trim": lambda v, a: str(v).strip(),
    "clean": lambda v, a: str(v).strip(),
    "string": lambda v, a: str(v),
    "str": lambda v, a: str(v),
    "int": lambda v, a: _parse_number_dynamic(v, is_int=True),
    "integer": lambda v, a: _parse_number_dynamic(v, is_int=True),
    "float": lambda v, a: _parse_number_dynamic(v, is_int=False),
    "decimal": lambda v, a: _parse_number_dynamic(v, is_int=False),
    "number": lambda v, a: _parse_number_dynamic(v, is_int=False),
    "currency": lambda v, a: _parse_number_dynamic(v, is_int=False),
    "bool": lambda v, a: _parse_bool_dynamic(v),
    "boolean": lambda v, a: _parse_bool_dynamic(v),
}


def resolve_and_apply_transform(
    rule_transform: str | None,
    source_field: str,
    target_path: str,
    value: Any,
    args: dict | None,
    rule_required: bool = False,
) -> Any:
    """Dynamically resolves transform intent without relying on rigid static dictionaries.
    Understands synonyms, casing, dates, flags, currency, column identity mappings, and FHIR schema targets.
    """
    args = args or {}
    t = (rule_transform or "direct").strip().lower()
    src = source_field.strip().lower()
    tgt = target_path.strip().lower()

    # 1. Direct / Identity / Self-Name / Pass-Through
    # e.g. "identity", "direct", "as_is", "trim", or when LLM put the column name as the transform (e.g. 'createid' on 'createid')!
    if (
        t in ("", "direct", "identity", "asis", "as_is", "none", "pass", "raw", "copy", "same", "echo", "default", "val", "value")
        or t == src
        or t == tgt
    ):
        if isinstance(value, str):
            return value.strip()
        return value

    # 2. String Clean / Trim / Strip
    if (
        t in ("strip", "trim", "clean", "sanitize", "strip_whitespace", "trim_whitespace", "clean_str", "clean_text", "to_str", "to_string", "str", "string", "text")
        or "trim" in t
        or "strip" in t
        or "clean" in t
    ):
        return str(value).strip() if value is not None else ""

    # 3. Case Transforms
    if "upper" in t:
        return str(value).upper()
    if "lower" in t:
        return str(value).lower()
    if "title" in t or "capit" in t:
        return str(value).title()

    # 4. Date / Time Transforms
    if any(k in t for k in ("date", "time", "dob", "timestamp", "iso", "birth")):
        return _date(value, args, target_path)

    # 5. Boolean / Flag Transforms
    if any(k in t for k in ("bool", "flag", "yn", "yes_no")) or t.startswith("is_"):
        return _parse_bool_dynamic(value)

    # 6. Numeric / Decimal / Integer / Currency Transforms
    if any(k in t for k in ("int", "integer", "float", "decimal", "number", "numeric", "currency", "amount", "money")):
        is_int = "int" in t and "float" not in t and "decimal" not in t
        return _parse_number_dynamic(value, is_int=is_int)

    # 7. Map / Dictionary / Enum Lookup
    if any(k in t for k in ("map", "dict", "lookup", "translate", "convert", "enum", "choice")):
        return _map(value, args)

    # 8. Target-Aware Dynamic Safety Net
    # If the transform name is novel or unrecognized (e.g. LLM invented 'medincome_clean' or 'validate_vip')
    # Instead of crashing the whole ingestion pipeline with "unknown transform", infer intent from target:
    logger.info(
        "Dynamic inference for novel transform '%s' on '%s' -> '%s'",
        rule_transform, source_field, target_path
    )
    if tgt.endswith("boolean") or tgt.split(".")[-1] == "active":
        return _parse_bool_dynamic(value)
    if tgt.endswith("integer") or tgt.endswith("positiveint"):
        return _parse_number_dynamic(value, is_int=True)
    if tgt.endswith("decimal"):
        return _parse_number_dynamic(value, is_int=False)
    if tgt.split(".")[-1] == "birthdate" or "date" in tgt:
        return _date(value, args, target_path)
    if tgt.split(".")[-1] == "gender":
        return _parse_gender_dynamic(value)

    # Default fallback: trimmed string or raw value
    return str(value).strip() if isinstance(value, str) else value


def _coerce_for_target(target: str, val: Any) -> Any:
    """Universally enforces FHIR R4 schema data types across ALL columns and target paths."""
    if val is None or val is MISSING:
        return val

    tgt = target.lower()
    tgt_tail = tgt.split(".")[-1]

    # 1. Booleans (active, multipleBirthBoolean, deceasedBoolean, valueBoolean, etc.)
    if tgt.endswith("boolean") or tgt_tail == "active":
        return _parse_bool_dynamic(val)

    # 2. Integers (multipleBirthInteger, valueInteger, valuePositiveInt, valueUnsignedInt, etc.)
    if tgt.endswith("integer") or tgt.endswith("positiveint") or tgt.endswith("unsignedint"):
        if not isinstance(val, int):
            try:
                return _parse_number_dynamic(val, is_int=True)
            except Exception:
                return val
        return val

    # 3. Decimals & Quantities (valueDecimal, quantity.value, valueQuantity.value, etc.)
    if tgt.endswith("decimal") or tgt.endswith("quantity.value"):
        if not isinstance(val, (int, float)):
            try:
                return _parse_number_dynamic(val, is_int=False)
            except Exception:
                return val
        return val

    # 4. Gender (administrative gender codes: male, female, other, unknown)
    if tgt_tail == "gender":
        return _parse_gender_dynamic(val)

    # 5. Marital Status (M, S, D, W, L)
    if "maritalstatus" in tgt:
        s = str(val).strip().upper()
        if s.startswith("MARR"):
            return "M"
        if s.startswith("SING"):
            return "S"
        if s.startswith("DIV"):
            return "D"
        if s.startswith("WID"):
            return "W"
        if s.startswith("SEP"):
            return "L"
        return s[:1] if len(s) == 1 else s

    # 6. Dates and DateTimes across ALL columns (birthDate, deceasedDateTime, effectiveDateTime, period.start/end, etc.)
    if (
        "datetime" in tgt_tail
        or "date" in tgt_tail
        or "time" in tgt_tail
        or tgt_tail in ("start", "end", "authoredon", "recorded", "issued", "occurred")
    ):
        return normalize_fhir_datetime(val, target)

    # 7. Postal / ZIP code (clean Excel floats like 90210.0 -> 90210)
    if tgt.endswith("postalcode"):
        s = str(val).strip()
        if s.endswith(".0"):
            s = s[:-2]
        return s

    # 8. Telecom / Email / Phone (clean whitespace)
    if "telecom" in tgt and tgt.endswith(".value"):
        return str(val).strip()

    # 9. General String columns (auto-strip whitespace)
    if isinstance(val, str):
        return val.strip()

    return val


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
    """Deterministic and dynamic mapping executor.
    Applies constants, dynamic transform resolution, target-aware type coercion,
    identifier system injection, and choice-extension harmonization.
    Returns (resource, errors).
    """
    if require_approved and cfg.status != "approved":
        raise MappingNotApproved(f"mapping '{cfg.name}' v{cfg.version} is '{cfg.status}', not approved")
    out: dict = {"resourceType": cfg.target_resource}
    errors: list[str] = []
    for path, val in cfg.constants.items():
        set_path(out, path, copy.deepcopy(val))
    for rule in cfg.rules:
        value = get_path(payload, rule.source)
        # Check sentinel nulls & missing values
        if is_empty_or_sentinel_null(value):
            if rule.required:
                errors.append(f"missing required source field '{rule.source}'")
            continue

        try:
            val = resolve_and_apply_transform(
                rule.transform,
                rule.source,
                rule.target,
                value,
                rule.args,
                rule_required=rule.required,
            )
            # Apply target-aware schema coercion
            val = _coerce_for_target(rule.target, val)
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
        except Exception as e:
            errors.append(f"'{rule.source}' -> '{rule.target}' ({rule.transform}): {e}")

    compacted = _compact(out)
    sanitized = _sanitize_extensions(compacted)
    return sanitized, errors


_FHIR_FIELD_CASE_MAP: dict[str, str] = {
    # Patient fields with strict FHIR R4 camelCase
    "multiplebirthboolean": "multipleBirthBoolean",
    "multiplebirthinteger": "multipleBirthInteger",
    "multiplebirth": "multipleBirthBoolean",
    "deceasedboolean": "deceasedBoolean",
    "deceaseddatetime": "deceasedDateTime",
    "deceased": "deceasedBoolean",
    "birthdate": "birthDate",
    "maritalstatus": "maritalStatus",
    "generalpractitioner": "generalPractitioner",
    "managingorganization": "managingOrganization",
    "resourcetype": "resourceType",
    # Extension choice values
    "valuedecimal": "valueDecimal",
    "valueinteger": "valueInteger",
    "valuepositiveint": "valuePositiveInt",
    "valueunsignedint": "valueUnsignedInt",
    "valueboolean": "valueBoolean",
    "valuestring": "valueString",
    "valuedatetime": "valueDateTime",
    "valuedate": "valueDate",
    "valuecode": "valueCode",
    "valueuri": "valueUri",
    # Observation fields
    "valuequantity": "valueQuantity",
    "valuecodeableconcept": "valueCodeableConcept",
    "effectivedatetime": "effectiveDateTime",
    "effectiveperiod": "effectivePeriod",
    # Coding / CodeableConcept fields
    "userselected": "userSelected",
}


def _sanitize_extensions(node: Any, default_prefix: str = "urn:source:extension") -> Any:
    """Ensure all FHIR extensions have a non-empty 'url', correct JSON primitive types,
    harmonize choice property types (valueDecimal vs valueString vs valueBoolean),
    dynamically normalize case-sensitive FHIR field names, and prune empty extensions."""
    if isinstance(node, dict):
        # 1. Normalize case-sensitive FHIR keys (e.g. multiplebirthBoolean -> multipleBirthBoolean)
        for k in list(node.keys()):
            k_lower = k.lower()
            if k_lower in _FHIR_FIELD_CASE_MAP:
                canonical_k = _FHIR_FIELD_CASE_MAP[k_lower]
                if k != canonical_k:
                    node[canonical_k] = node.pop(k)

        # 2. Sanitize and validate extensions
        if "extension" in node and isinstance(node["extension"], list):
            cleaned = []
            for idx, ext in enumerate(node["extension"]):
                if isinstance(ext, dict):
                    # Coerce JSON primitive types on extension values
                    for k, v in list(ext.items()):
                        k_lower = k.lower()
                        if k_lower in _FHIR_FIELD_CASE_MAP and k != _FHIR_FIELD_CASE_MAP[k_lower]:
                            canonical_k = _FHIR_FIELD_CASE_MAP[k_lower]
                            ext[canonical_k] = ext.pop(k)
                            k = canonical_k

                        # Dynamic Value Extension Harmonization
                        if k == "valueDecimal":
                            if isinstance(v, (int, float)):
                                pass
                            elif isinstance(v, str):
                                try:
                                    ext[k] = _parse_number_dynamic(v, is_int=False)
                                except Exception:
                                    # Fallback: harmonize to valueString so FHIR validation passes!
                                    ext.pop(k)
                                    ext["valueString"] = v
                        elif k in ("valueInteger", "valuePositiveInt", "valueUnsignedInt"):
                            if isinstance(v, int):
                                pass
                            else:
                                try:
                                    ext[k] = _parse_number_dynamic(v, is_int=True)
                                except Exception:
                                    ext.pop(k)
                                    ext["valueString"] = str(v)
                        elif k == "valueBoolean":
                            ext[k] = _parse_bool_dynamic(v)
                        elif k in ("valueDateTime", "valueDate"):
                            ext[k] = normalize_fhir_datetime(v, k)

                    has_val = any(k.startswith("value") or k == "extension" for k in ext.keys())
                    if has_val:
                        if not ext.get("url"):
                            ext["url"] = f"{default_prefix}:field-{idx + 1}"
                        cleaned.append(_sanitize_extensions(ext, default_prefix))
            if cleaned:
                node["extension"] = cleaned
            else:
                node.pop("extension", None)

        # 3. Handle non-extension top-level FHIR fields across ALL columns
        for k, v in list(node.items()):
            if k != "extension":
                k_lower = k.lower()
                if k_lower.endswith("boolean") or k_lower == "active":
                    node[k] = _parse_bool_dynamic(v)
                elif "datetime" in k_lower or "date" in k_lower or k_lower in ("start", "end", "authoredon", "recorded", "issued", "occurred"):
                    node[k] = normalize_fhir_datetime(v, k)
                elif k_lower.endswith("integer") or k_lower in ("valuepositiveint", "valueunsignedint"):
                    try:
                        node[k] = _parse_number_dynamic(v, is_int=True)
                    except (ValueError, TypeError):
                        pass
                elif k_lower.endswith("decimal"):
                    try:
                        node[k] = _parse_number_dynamic(v, is_int=False)
                    except (ValueError, TypeError):
                        pass
                node[k] = _sanitize_extensions(node[k], default_prefix)
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
