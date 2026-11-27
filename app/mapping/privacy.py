"""Zero-PHI structural masking for LLM prompts (mapping synthesis & self-healing).

Ensures raw patient values (names, dates of birth, IDs, SSNs, etc.) are never
sent to external LLM APIs; only column names and anonymized format/type tokens
are transmitted.
"""
import re
from typing import Any

_DATE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^\d{4}-\d{2}-\d{2}$"), "<DATE: YYYY-MM-DD>"),
    (re.compile(r"^\d{1,2}-[A-Za-z]{3}-\d{4}$"), "<DATE: DD-Mon-YYYY>"),
    (re.compile(r"^\d{1,2}-[A-Za-z]{3}-\d{2}$"), "<DATE: DD-Mon-YY>"),
    (re.compile(r"^\d{2}-\d{2}-\d{4}$"), "<DATE: DD-MM-YYYY>"),
    (re.compile(r"^\d{2}-\d{2}-\d{2}$"), "<DATE: YY-MM-DD>"),
    (re.compile(r"^\d{1,2}/\d{1,2}/\d{4}$"), "<DATE: MM/DD/YYYY>"),
    (re.compile(r"^\d{4}/\d{1,2}/\d{1,2}$"), "<DATE: YYYY/MM/DD>"),
    (re.compile(r"^\d{4}-\d{2}-\d{2}T"), "<DATETIME: ISO-8601>"),
]

_SSN_RE = re.compile(r"^\d{3}-\d{2}-\d{4}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_RE = re.compile(r"^[+\d\s().-]{7,20}$")
_INPUT_VAL_RE = re.compile(r"input_value=(['\"]).*?\1")


def mask_value_for_llm(value: Any) -> str:
    """Return an anonymized structural token describing a value without any PHI."""
    if value is None:
        return "<EMPTY>"
    if isinstance(value, bool):
        return "<BOOL>"
    if isinstance(value, (int, float)):
        return "<NUMBER>"

    s = str(value).strip()
    if not s:
        return "<EMPTY>"
    lower = s.lower()
    if lower in {"null", "none", "n/a", "na", "nan", "-", "—"}:
        return "<NULL_SENTINEL>"
    if lower in {"true", "false", "y", "n", "yes", "no", "0", "1"}:
        return f"<FLAG: {len(s)}ch>"
    if lower in {"m", "f", "male", "female", "other", "unknown", "active", "term", "inactive"}:
        return f"<ENUM: {len(s)}ch>"

    for pat, label in _DATE_PATTERNS:
        if pat.match(s):
            return label

    if _SSN_RE.match(s) or "REDACTED_SOCIAL_SECURITY" in s:
        return "<SSN_PATTERN>"
    if _EMAIL_RE.match(s):
        return "<EMAIL>"
    if s.isdigit():
        if len(s) == 5 and 10000 <= int(s) <= 70000:
            return "<NUMBER_OR_EXCEL_DATE: 5 digits>"
        return f"<DIGITS: {len(s)}>"
    if re.match(r"^-?\d+\.\d+$", s):
        return "<DECIMAL>"
    if _PHONE_RE.match(s) and sum(c.isdigit() for c in s) >= 7:
        return "<PHONE>"
    if re.match(r"^[A-Za-z0-9_-]+$", s) and any(c.isdigit() for c in s):
        return f"<ID_TOKEN: {len(s)} chars>"

    words = len(s.split())
    return f"<TEXT: {words} word{'s' if words != 1 else ''}>"


def redact_sample_for_llm(sample: dict[str, Any]) -> dict[str, str]:
    """Mask every value in a sample record so no raw PHI/PII is sent to an LLM."""
    if not isinstance(sample, dict):
        return {}
    return {str(k): mask_value_for_llm(v) for k, v in sample.items()}


def redact_errors_for_llm(errors: list[str]) -> list[str]:
    """Scrub raw `input_value='...'` snippets from Pydantic/validation traces."""
    cleaned: list[str] = []
    for err in errors or []:
        s = _INPUT_VAL_RE.sub("input_value='<REDACTED>'", str(err))
        cleaned.append(s)
    return cleaned
