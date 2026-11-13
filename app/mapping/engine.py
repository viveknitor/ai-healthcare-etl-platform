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


def _date(v: Any, args: dict) -> str:
    fmt = args.get("from", "%Y-%m-%d")
    return datetime.strptime(str(v), fmt).strftime("%Y-%m-%d")


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
            set_path(out, rule.target, fn(value, rule.args))
        except Exception as e:  # noqa: BLE001 - report, don't crash the batch
            errors.append(f"'{rule.source}' -> '{rule.target}' ({rule.transform}): {e}")
    return _compact(out), errors


def _compact(o: Any) -> Any:
    """Drop None placeholders left by sparse list indexes."""
    if isinstance(o, dict):
        return {k: _compact(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_compact(v) for v in o if v is not None]
    return o
