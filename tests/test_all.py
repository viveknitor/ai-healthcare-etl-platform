import json
from pathlib import Path

import httpx
import pytest

from app.connectors.hapi import HapiClient
from app.connectors.medplum import MedplumClient
from app.mapping.engine import MappingNotApproved, apply_mapping
from app.mapping.models import MappingConfig
from app.mapping.suggest import SuggestError, suggest_mapping
from app.pipeline import run_hapi_to_medplum
from app.validation import validate_fhir

MAPPING = MappingConfig.model_validate(json.loads(Path("mappings/member_to_patient.json").read_text()))
SAMPLE = {"member_id": "M1001", "fname": "John", "lname": "Smith", "dob": "1990-01-15", "sex": "M"}


def test_mapping_produces_valid_patient():
    res, errs = apply_mapping(MAPPING, SAMPLE)
    assert errs == []
    assert res["name"][0] == {"given": ["John"], "family": "Smith"}
    assert res["birthDate"] == "1990-01-15" and res["gender"] == "male"
    assert res["identifier"][0] == {"system": "urn:source:member-system", "value": "M1001"}
    assert validate_fhir(res) == []


def test_mapping_reports_missing_required_and_bad_date():
    bad = {**SAMPLE, "dob": "15/01/1990"}
    del bad["lname"]
    _, errs = apply_mapping(MAPPING, bad)
    assert any("lname" in e for e in errs) and any("dob" in e for e in errs)


def test_unapproved_mapping_refused():
    cfg = MAPPING.model_copy(update={"status": "pending_review"})
    with pytest.raises(MappingNotApproved):
        apply_mapping(cfg, SAMPLE)


def test_validation_catches_bad_gender():
    assert validate_fhir({"resourceType": "Patient", "gender": "banana"})


def _hapi_transport():
    pages = {
        "https://h/Patient": {"link": [{"relation": "next", "url": "https://h/page2"}],
                              "entry": [{"resource": {"resourceType": "Patient", "id": "1", "gender": "male",
                                                      "meta": {"versionId": "3"}}}]},
        "https://h/page2": {"entry": [{"resource": {"resourceType": "Patient", "id": "2", "gender": "banana"}},
                                      {"resource": {"resourceType": "Patient", "id": "3"}}]},
    }
    return httpx.MockTransport(lambda r: httpx.Response(200, json=pages[str(r.url).split("?")[0]]))


def _medplum_transport(fail_ids=()):
    def handler(req):
        if req.url.path == "/oauth2/token":
            return httpx.Response(200, json={"access_token": "t", "expires_in": 3600})
        assert req.headers["authorization"] == "Bearer t"
        assert req.method == "PUT" and "identifier=urn" in str(req.url)
        body = json.loads(req.content)
        if body["identifier"][-1]["value"] in fail_ids:
            return httpx.Response(400, json={"issue": "nope"})
        assert "id" not in body and "meta" not in body
        return httpx.Response(201, json={**body, "id": "mp-" + body["identifier"][-1]["value"]})
    return httpx.MockTransport(handler)


def test_pipeline_paging_validation_and_isolated_failures():
    hapi = HapiClient("https://h", transport=_hapi_transport())
    mp = MedplumClient("http://mp", "id", "secret", transport=_medplum_transport(fail_ids={"3"}))
    rep = run_hapi_to_medplum(hapi, mp, count=10)
    by = {r.source_id: r.status for r in rep.results}
    assert by == {"1": "delivered", "2": "invalid", "3": "failed"}


def test_pipeline_dry_run_writes_nothing():
    hapi = HapiClient("https://h", transport=_hapi_transport())
    rep = run_hapi_to_medplum(hapi, None, count=1, dry_run=True)
    assert rep.summary()["counts"] == {"dry_run": 1}


def _llm(text):
    return httpx.MockTransport(lambda r: httpx.Response(200, json={
        "candidates": [{"content": {"parts": [{"text": text}], "role": "model"}}]
    }))


def test_suggester_forces_pending_review():
    out = json.dumps({"name": "x", "target_resource": "Patient", "status": "approved",
                      "rules": [{"source": "fname", "target": "name[0].given[0]", "confidence": 0.95}]})
    cfg = suggest_mapping(SAMPLE, "Patient", api_key="k", model="m", transport=_llm("```json\n" + out + "\n```"))
    assert cfg.status == "pending_review"


def test_suggester_rejects_hallucinated_source_field():
    out = json.dumps({"name": "x", "target_resource": "Patient",
                      "rules": [{"source": "ssn", "target": "identifier[0].value"}]})
    with pytest.raises(SuggestError):
        suggest_mapping(SAMPLE, "Patient", api_key="k", model="m", transport=_llm(out))


def test_suggester_requires_api_key():
    with pytest.raises(SuggestError, match="GEMINI_API_KEY"):
        suggest_mapping(SAMPLE, "Patient", api_key="", model="m")


def test_normalize_remaps_cross_resource_reference():
    from app.pipeline import normalize_for_target
    obs = {
        "resourceType": "Observation",
        "id": "obs-1",
        "status": "final",
        "code": {"coding": [{"system": "http://loinc.org", "code": "883-9", "display": "ABO group"}]},
        "subject": {"reference": "Patient/nhanes-120412"},
        "encounter": {"reference": "Encounter/enc-999"}
    }
    normalized, system, val = normalize_for_target(obs, "hapi")
    assert normalized["subject"]["reference"] == "Patient?identifier=urn:source:hapi|nhanes-120412"
    assert normalized["encounter"]["reference"] == "Encounter?identifier=urn:source:hapi|enc-999"
    assert "id" not in normalized
    assert normalized["identifier"][-1] == {"system": "urn:source:hapi", "value": "obs-1"}


def test_extract_clinical_summary_observation_and_condition():
    from app.pipeline import extract_clinical_summary
    obs = {
        "resourceType": "Observation",
        "status": "final",
        "code": {"text": "Blood Glucose"},
        "valueQuantity": {"value": 98, "unit": "mg/dL"},
        "subject": {"reference": "Patient/123"}
    }
    s = extract_clinical_summary(obs)
    assert s["title"] == "Blood Glucose"
    assert s["primary_value"] == "98 mg/dL"
    assert s["subject_reference"] == "Patient/123"

    cond = {
        "resourceType": "Condition",
        "code": {"text": "Hypertension", "coding": [{"code": "I10"}]},
        "clinicalStatus": {"coding": [{"code": "active"}]}
    }
    sc = extract_clinical_summary(cond)
    assert sc["title"] == "Hypertension"
    assert "I10" in sc["primary_value"]


def test_dynamic_reconciliation_any_schema():
    from app.pipeline import format_dynamic_value, generate_dynamic_reconciliation, get_field_display_label

    # 1. Custom / Non-FHIR dynamic field labels
    assert get_field_display_label("birthDate") == "Date of Birth"
    assert get_field_display_label("custom_health_metric") == "Custom Health Metric"
    assert get_field_display_label("systolicBloodPressure") == "Systolic Blood Pressure"

    # 2. Format nested dynamic types
    assert format_dynamic_value({"value": 120, "unit": "mmHg"}) == "120 mmHg"
    assert format_dynamic_value({"family": "Doe", "given": ["Jane"]}) == "Jane Doe"
    assert format_dynamic_value({"coding": [{"code": "883-9", "display": "ABO group"}]}) == "ABO group [883-9]"

    # 3. Dynamic reconciliation matrix for arbitrary source and target
    source_custom = {
        "member_id": "M99",
        "patient_name": "Alice Wonderland",
        "vitals": {"systolic": 118, "diastolic": 76},
        "notes": "Annual checkup"
    }
    target_custom = {
        "resourceType": "Observation",
        "identifier": [{"system": "urn:source:custom", "value": "M99"}],
        "vitals": {"systolic": 118, "diastolic": 76},
        "status": "final"
    }
    matrix = generate_dynamic_reconciliation(source_custom, target_custom, source_name="CustomEHR", target_name="Medplum")
    field_names = [m["field"] for m in matrix]
    assert "member_id" in field_names
    assert "identifier" in field_names
    assert "vitals" in field_names
    # Verify status determination
    vitals_row = next(m for m in matrix if m["field"] == "vitals")
    assert vitals_row["status"] == "preserved"
    ident_row = next(m for m in matrix if m["field"] == "identifier")
    assert ident_row["status"] == "scoped_identity"


def test_parse_uploaded_file_csv_and_tsv():
    from app.upload_pipeline import parse_uploaded_file

    csv_text = "memid,fullname,sex,status\n101,John Doe,M,ACTIVE\n102,Jane Smith,F,TERM\n"
    rows = parse_uploaded_file(csv_text, "data.csv")
    assert len(rows) == 2
    assert rows[0]["memid"] == "101"
    assert rows[0]["fullname"] == "John Doe"
    assert rows[1]["sex"] == "F"

    tsv_text = "memid\tfullname\tsex\n201\tBob Ray\tM\n"
    t_rows = parse_uploaded_file(tsv_text, "export.tsv")
    assert len(t_rows) == 1
    assert t_rows[0]["memid"] == "201"


def test_upload_pipeline_dry_run_ingestion():
    from app.mapping.models import MappingConfig
    from app.upload_pipeline import ingest_uploaded_records

    mapping = MappingConfig(
        name="plandata_test",
        version=1,
        target_resource="Patient",
        status="approved",
        rules=[
            {"source": "memid", "target": "identifier[0].value", "required": True},
            {"source": "fullname", "target": "name[0].text", "required": True},
            {"source": "sex", "target": "gender", "transform": "map", "args": {"M": "male", "F": "female", "default": "unknown"}},
        ]
    )
    rows = [
        {"memid": "M101", "fullname": "Quincy Kowalski", "sex": "M"},
        {"memid": "M102", "fullname": "Elena Rostova", "sex": "F"},
    ]
    report = ingest_uploaded_records(None, rows, mapping, dataset_name="plandata", dry_run=True)
    assert report["summary"]["total"] == 2
    assert report["summary"]["counts"]["dry_run"] == 2
    assert report["results"][0]["patient_summary"]["title"] == "Quincy Kowalski"
    assert report["results"][1]["patient_summary"]["gender"] == "female"


def test_mapping_storage_save_and_list(tmp_path, monkeypatch):
    from app.mapping.models import MappingConfig
    from app.mapping.storage import list_mappings, load_mapping, save_mapping
    import app.mapping.storage as storage_mod

    monkeypatch.setattr(storage_mod, "MAPPINGS_DIR", tmp_path)

    cfg = MappingConfig(name="auto_test", target_resource="Patient", status="approved", rules=[])
    filename = save_mapping(cfg)
    assert filename == "auto_test.json"
    loaded = load_mapping("auto_test")
    assert loaded is not None
    assert loaded.name == "auto_test"
    all_maps = list_mappings()
    assert any(m["name"] == "auto_test" for m in all_maps)


def test_extension_mapping_auto_url_and_validation():
    """Verify that mapping custom columns to extension[n].value* automatically
    receives a valid 'url' property, empty extensions are pruned, and passes FHIR R4 validation."""
    from app.mapping.engine import apply_mapping
    from app.mapping.models import MappingConfig
    from app.validation import validate_fhir

    mapping = MappingConfig(
        name="ext_test",
        version=1,
        target_resource="Patient",
        status="approved",
        rules=[
            {"source": "memid", "target": "identifier[0].value", "required": True},
            {"source": "fullname", "target": "name[0].text"},
            {"source": "obs_ethnicid", "target": "extension[0].valueString"},
            {"source": "medincome", "target": "extension[1].valueString"},
            {"source": "missing_col", "target": "extension[2].valueString"},
        ]
    )

    row = {
        "memid": "100001",
        "fullname": "Maria Rodriguez",
        "obs_ethnicid": "HISPANIC",
        "medincome": "75000",
        "missing_col": "",  # Should be skipped and pruned cleanly
    }

    resource, errors = apply_mapping(mapping, row)
    assert errors == []
    assert len(resource["extension"]) == 2
    assert resource["extension"][0] == {
        "url": "urn:source:extension:obs_ethnicid",
        "valueString": "HISPANIC",
    }
    assert resource["extension"][1] == {
        "url": "urn:source:extension:medincome",
        "valueString": "75000",
    }

    # FHIR validation must pass with zero errors
    val_errs = validate_fhir(resource)
    assert val_errs == []


def test_dynamic_reconciliation_mapping_aware():
    """Verify that generate_dynamic_reconciliation properly links source columns to FHIR targets
    when a MappingConfig is provided, preventing false 'Omitted' statuses."""
    from app.mapping.engine import apply_mapping
    from app.mapping.models import MappingConfig
    from app.pipeline import generate_dynamic_reconciliation

    mapping = MappingConfig(
        name="test_recon_map",
        target_resource="Patient",
        status="approved",
        rules=[
            {"source": "fullname", "target": "name[0].text"},
            {"source": "dob", "target": "birthDate"},
            {"source": "sex", "target": "gender", "transform": "map", "args": {"M": "male", "F": "female"}},
            {"source": "deathdate", "target": "deceasedDateTime"},
        ]
    )

    row = {
        "fullname": "Aarav Sharma",
        "dob": "1988-04-12",
        "sex": "M",
        "deathdate": "",
        "unmapped_extra_col": "123",
    }

    res, _ = apply_mapping(mapping, row)
    table = generate_dynamic_reconciliation(row, res, mapping=mapping)

    statuses = {item["field"]: item["status"] for item in table}
    assert statuses["fullname"] == "preserved"
    assert statuses["dob"] == "preserved"
    assert statuses["sex"] == "transformed"
    assert statuses["deathdate"] == "empty"
    assert statuses["unmapped_extra_col"] == "dropped"


def test_extension_primitive_type_coercion():
    """Verify that valueDecimal, valueInteger, and valueBoolean strings are coerced to JSON primitives."""
    from app.mapping.engine import apply_mapping
    from app.mapping.models import MappingConfig

    mapping = MappingConfig(
        name="test_coercion",
        target_resource="Patient",
        status="approved",
        rules=[
            {"source": "medincome", "target": "extension[0].valueDecimal"},
            {"source": "count", "target": "extension[1].valueInteger"},
            {"source": "isvip", "target": "extension[2].valueBoolean"},
        ]
    )

    row = {
        "medincome": "65000",
        "count": "42",
        "isvip": "true",
    }

    res, errors = apply_mapping(mapping, row)
    assert errors == []
    assert res["extension"][0]["valueDecimal"] == 65000
    assert isinstance(res["extension"][0]["valueDecimal"], (int, float))
    assert res["extension"][1]["valueInteger"] == 42
    assert isinstance(res["extension"][1]["valueInteger"], int)
    assert res["extension"][2]["valueBoolean"] is True
    assert isinstance(res["extension"][2]["valueBoolean"], bool)


def test_dynamic_date_transform_handles_sql_server_and_arbitrary_formats():
    """Verify that date transform automatically handles SQL Server milliseconds (00:00:00.000),
    ISO timestamps, and US dates dynamically without requiring manual format configs."""
    from app.mapping.engine import apply_mapping
    from app.mapping.models import MappingConfig
    from app.validation import validate_fhir

    mapping = MappingConfig(
        name="test_date_dynamic",
        target_resource="Patient",
        status="approved",
        rules=[
            {"source": "id", "target": "identifier[0].value"},
            {"source": "dob", "target": "birthDate", "transform": "date"},
        ]
    )

    test_dates = [
        "1988-04-12 00:00:00.000",
        "1988-04-12 00:00:00",
        "1988-04-12T00:00:00.000Z",
        "1988-04-12",
        "04/12/1988",
        "1988/04/12",
        "19880412",
    ]

    for d_str in test_dates:
        row = {"id": "1", "dob": d_str}
        res, errors = apply_mapping(mapping, row)
        assert errors == [], f"Failed on date {d_str}: {errors}"
        assert res["birthDate"] == "1988-04-12", f"Failed on date {d_str}: got {res.get('birthDate')}"
        assert validate_fhir(res) == []


def test_parse_xlsx_bytes_in_upload_pipeline():
    """Verify standard library zipfile/xml parser parses .xlsx bytes correctly."""
    import io
    import zipfile
    from app.upload_pipeline import _parse_xlsx_bytes

    # Build a minimal valid .xlsx in-memory
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", zipfile.ZIP_DEFLATED) as zf:
        # shared strings
        sst_xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<si><t>first_name</t></si>'
            '<si><t>last_name</t></si>'
            '<si><t>Alice</t></si>'
            '<si><t>Wonderland</t></si>'
            '</sst>'
        )
        zf.writestr("xl/sharedStrings.xml", sst_xml)

        # sheet1: row 1 (headers: s=0, s=1), row 2 (data: s=2, s=3)
        sheet_xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<sheetData>'
            '<row r="1">'
            '<c r="A1" t="s"><v>0</v></c>'
            '<c r="B1" t="s"><v>1</v></c>'
            '</row>'
            '<row r="2">'
            '<c r="A2" t="s"><v>2</v></c>'
            '<c r="B2" t="s"><v>3</v></c>'
            '</row>'
            '</sheetData>'
            '</worksheet>'
        )
        zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)

    records = _parse_xlsx_bytes(bio.getvalue())
    assert len(records) == 1
    assert records[0] == {"first_name": "Alice", "last_name": "Wonderland"}


def test_llm_metrics_captured_in_suggest():
    """Verify that suggest_mapping captures usage tokens, latency, and estimated cost."""
    out = json.dumps({
        "name": "test_metrics",
        "target_resource": "Patient",
        "status": "pending_review",
        "rules": [{"source": "member_id", "target": "identifier[0].value"}]
    })

    def mock_handler(req):
        return httpx.Response(200, json={
            "candidates": [{"content": {"parts": [{"text": out}], "role": "model"}}],
            "usageMetadata": {
                "promptTokenCount": 450,
                "candidatesTokenCount": 180,
                "totalTokenCount": 630
            }
        })

    cfg = suggest_mapping(
        {"member_id": "123"},
        "Patient",
        api_key="mock",
        model="gemini-2.5-flash",
        transport=httpx.MockTransport(mock_handler)
    )

    assert "llm_metrics" in cfg.metadata
    metrics = cfg.metadata["llm_metrics"]
    assert metrics["prompt_tokens"] == 450
    assert metrics["completion_tokens"] == 180
    assert metrics["total_tokens"] == 630
    assert metrics["cost_usd"] > 0
    assert "cost_formatted" in metrics
    assert metrics["model"] == "gemini-2.5-flash"






