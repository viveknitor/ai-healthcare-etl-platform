"""Tests for zero-PHI structural masking and extended date normalization."""
from app.mapping.engine import _date
from app.mapping.privacy import redact_errors_for_llm, redact_sample_for_llm


def test_redact_sample_for_llm_hides_all_phi():
    sample = {
        "memid": "MEM0500004",
        "fullname": "Jane Doe",
        "dob": "15-Jun-1985",
        "dob2": "85-06-15",
        "ssn": "123-45-6789",
        "sex": "F",
    }
    masked = redact_sample_for_llm(sample)
    serialized = str(masked)

    assert "MEM0500004" not in serialized
    assert "Jane" not in serialized
    assert "Doe" not in serialized
    assert "15-Jun-1985" not in serialized
    assert "85-06-15" not in serialized
    assert "123-45-6789" not in serialized

    assert masked["dob"] == "<DATE: DD-Mon-YYYY>"
    assert masked["dob2"] == "<DATE: YY-MM-DD>"
    assert masked["ssn"] == "<SSN_PATTERN>"
    assert masked["fullname"] == "<TEXT: 2 words>"


def test_redact_errors_for_llm_scrubs_input_value():
    errs = ["birthDate; Value error, invalid date [input_value='15-Jun-1985', input_type=str]"]
    cleaned = redact_errors_for_llm(errs)
    assert "15-Jun-1985" not in cleaned[0]
    assert "input_value='<REDACTED>'" in cleaned[0]


def test_date_transform_handles_text_month_and_two_digit_year():
    assert _date("15-Jun-1985", {}, "birthDate") == "1985-06-15"
    assert _date("85-06-15", {}, "birthDate") == "1985-06-15"
