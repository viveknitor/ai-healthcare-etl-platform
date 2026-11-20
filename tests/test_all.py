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

MAPPING_FIXTURE = {
    "name": "member_to_patient",
    "version": 1,
    "target_resource": "Patient",
    "status": "approved",
    "constants": {"identifier[0].system": "urn:source:member-system"},
    "rules": [
        {"source": "member_id", "target": "identifier[0].value", "required": True},
        {"source": "fname", "target": "name[0].given[0]"},
        {"source": "lname", "target": "name[0].family", "required": True},
        {"source": "dob", "target": "birthDate", "transform": "date", "args": {"from": "%Y-%m-%d"}},
        {"source": "sex", "target": "gender", "transform": "map",
         "args": {"m": "male", "f": "female", "u": "unknown", "default": "unknown"}},
    ],
}
MAPPING = MappingConfig.model_validate(MAPPING_FIXTURE)
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


def test_dynamic_case_normalization_for_multiplebirthboolean():
    """Verify that multiplebirthBoolean (lowercase 'b') and string boolean values
    are automatically normalized to valid FHIR R4 multipleBirthBoolean."""
    from app.mapping.engine import apply_mapping
    from app.mapping.models import MappingConfig
    from app.validation import validate_fhir

    # Simulates an AI mapping with the lowercase typo "multiplebirthBoolean"
    mapping = MappingConfig(
        name="test_multiple_birth_resilience",
        target_resource="Patient",
        status="approved",
        rules=[
            {"source": "id", "target": "identifier[0].value"},
            {"source": "is_twin", "target": "multiplebirthBoolean"},
            {"source": "is_dead", "target": "deceasedboolean"},
        ]
    )

    row = {"id": "MEM0000031", "is_twin": "False", "is_dead": "false"}
    res, errors = apply_mapping(mapping, row)

    assert errors == []
    assert "multipleBirthBoolean" in res
    assert "multiplebirthBoolean" not in res
    assert res["multipleBirthBoolean"] is False
    assert res["deceasedBoolean"] is False
    assert validate_fhir(res) == []


def test_ai_self_healing_agent_repairs_contract_and_records_telemetry():
    """Verify that heal_mapping_config captures errors, queries LLM, repairs the rule target,
    verifies against sample, and stores audit history."""
    from app.mapping.heal import heal_mapping_config
    from app.mapping.models import MappingConfig

    failing_mapping = MappingConfig(
        name="failing_test",
        target_resource="Patient",
        status="pending_review",
        rules=[
            {"source": "id", "target": "identifier[0].value"},
            {"source": "is_twin", "target": "multiplebirthBoolean"},  # typo lowercase 'b'
        ]
    )

    repaired_llm_json = json.dumps({
        "name": "failing_test",
        "target_resource": "Patient",
        "status": "pending_review",
        "rules": [
            {"source": "id", "target": "identifier[0].value", "transform": "direct"},
            {"source": "is_twin", "target": "multipleBirthBoolean", "transform": "direct", "notes": "Self-healed: fixed casing to multipleBirthBoolean"}
        ]
    })

    def mock_heal_transport(req):
        return httpx.Response(200, json={
            "candidates": [{"content": {"parts": [{"text": repaired_llm_json}], "role": "model"}}],
            "usageMetadata": {
                "promptTokenCount": 520,
                "candidatesTokenCount": 210,
                "totalTokenCount": 730
            }
        })

    sample_row = {"id": "MEM0000031", "is_twin": False}
    errors = ["1 validation error for Patient; multiplebirthBoolean; Extra inputs are not permitted"]

    healed_cfg, changes = heal_mapping_config(
        failing_mapping,
        sample_row,
        errors,
        api_key="mock",
        model="gemini-2.5-flash",
        transport=httpx.MockTransport(mock_heal_transport)
    )

    # Verify rule was healed
    assert len(healed_cfg.rules) == 2
    healed_rule = next(r for r in healed_cfg.rules if r.source == "is_twin")
    assert healed_rule.target == "multipleBirthBoolean"
    assert any("multipleBirthBoolean" in c for c in changes)

    # Verify healing history telemetry
    assert "healing_history" in healed_cfg.metadata
    history = healed_cfg.metadata["healing_history"]
    assert len(history) == 1
    assert history[0]["tokens"] == 730
    assert history[0]["cost_usd"] > 0
    assert history[0]["model"] == "gemini-2.5-flash"


def test_auto_heal_endpoint():
    """Verify POST /mappings/auto-heal endpoint in FastAPI."""
    from starlette.testclient import TestClient
    from app.main import app
    from unittest.mock import patch
    from app.mapping.models import MappingConfig

    client = TestClient(app)

    mapping = MappingConfig(
        name="endpoint_test",
        target_resource="Patient",
        status="pending_review",
        rules=[{"source": "id", "target": "identifier[0].value"}]
    )

    healed_mapping = mapping.model_copy()
    healed_mapping.rules[0].target = "identifier[0].value"

    with patch("app.main.heal_mapping_config", return_value=(healed_mapping, ["Healed field"])):
        resp = client.post(
            "/mappings/auto-heal",
            json={
                "mapping": mapping.model_dump(),
                "sample": {"id": "1"},
                "errors": ["some schema error"]
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["changes"] == ["Healed field"]


def test_stream_uploaded_records():
    """Verify stream_uploaded_records yields event objects row-by-row and finishes with complete event."""
    from app.upload_pipeline import stream_uploaded_records
    from app.mapping.models import MappingConfig

    mapping = MappingConfig(
        name="test_stream",
        target_resource="Patient",
        status="approved",
        rules=[{"source": "id", "target": "identifier[0].value"}]
    )

    rows = [{"id": f"PAT-{i}"} for i in range(1, 4)]
    events = list(stream_uploaded_records(None, rows, mapping, dataset_name="stream_test", dry_run=True))

    # 3 record events + 1 complete event
    assert len(events) == 4
    for i in range(3):
        assert events[i]["type"] == "record"
        assert events[i]["index"] == i + 1
        assert events[i]["total"] == 3
        assert events[i]["result"]["status"] == "dry_run"

    complete = events[3]
    assert complete["type"] == "complete"
    assert complete["summary"]["total"] == 3
    assert complete["summary"]["counts"]["dry_run"] == 3


def test_dynamic_transform_resolution_and_edge_cases():
    """Verify that dynamic transform resolver understands LLM-invented transform names,
    synonyms ('identity', 'trim', 'clean'), column-name transforms ('createid'),
    novel transforms via target-aware inference, and sentinel null handling."""
    from app.mapping.engine import apply_mapping
    from app.mapping.models import MappingConfig
    from app.validation import validate_fhir

    mapping = MappingConfig(
        name="test_dynamic_edge",
        target_resource="Patient",
        status="approved",
        rules=[
            {"source": "memid", "target": "identifier[0].value", "required": True},
            {"source": "medincome", "target": "extension[0].valueDecimal", "transform": "identity"},
            {"source": "lastupdate", "target": "extension[1].valueString", "transform": "trim"},
            {"source": "createid", "target": "extension[2].valueString", "transform": "createid"},
            {"source": "isvip", "target": "extension[3].valueBoolean", "transform": "to_bool"},
            {"source": "novel_field", "target": "extension[4].valueDecimal", "transform": "novel_ai_calc"},
            {"source": "sentinel_col", "target": "extension[5].valueString", "transform": "trim"},
            {"source": "dob", "target": "birthDate", "transform": "date"},
            {"source": "sex", "target": "gender", "transform": "gender_detect"},
        ]
    )

    row = {
        "memid": "MEM001",
        "medincome": " $75,500.00 ",
        "lastupdate": "  2024-05-01 10:00:00  ",
        "createid": "SYSTEM_ADMIN",
        "isvip": "Y",
        "novel_field": "$1,200",
        "sentinel_col": "NULL",  # Sentinel null string -> should be omitted safely
        "dob": "1992-08-15 00:00:00.000",
        "sex": "Female",
    }

    res, errors = apply_mapping(mapping, row)
    assert errors == [], f"Unexpected mapping errors: {errors}"
    assert res["birthDate"] == "1992-08-15"
    assert res["gender"] == "female"
    assert res["extension"][0]["valueDecimal"] == 75500.0
    assert res["extension"][1]["valueString"] == "2024-05-01 10:00:00"
    assert res["extension"][2]["valueString"] == "SYSTEM_ADMIN"
    assert res["extension"][3]["valueBoolean"] is True
    assert res["extension"][4]["valueDecimal"] == 1200.0
    # sentinel_col should not be present in extensions
    ext_urls = [e["url"] for e in res["extension"]]
    assert "urn:source:extension:sentinel_col" not in ext_urls

    val_errors = validate_fhir(res)
    assert val_errors == [], f"FHIR validation errors: {val_errors}"


def test_sentinel_null_on_required_field_raises_error():
    """Verify that a sentinel null ('N/A', 'NULL', 'NaN') on a required field fails validation cleanly."""
    from app.mapping.engine import apply_mapping
    from app.mapping.models import MappingConfig

    mapping = MappingConfig(
        name="test_req_null",
        target_resource="Patient",
        status="approved",
        rules=[
            {"source": "memid", "target": "identifier[0].value", "required": True},
        ]
    )

    for sentinel in ("NULL", "null", "N/A", "NaN", "None", "—", ""):
        res, errors = apply_mapping(mapping, {"memid": sentinel})
        assert len(errors) == 1
        assert "missing required source field 'memid'" in errors[0]


def test_deceased_datetime_dynamic_normalization():
    """Verify that deceasedDateTime values like '2026-08-14T00:00:00' or '2026-08-14 00:00:00.000'
    are dynamically normalized to satisfy FHIR R4 DateTime spec regex, preventing Pydantic validation crashes."""
    from app.mapping.engine import apply_mapping
    from app.mapping.models import MappingConfig
    from app.validation import validate_fhir

    mapping = MappingConfig(
        name="test_death_date",
        target_resource="Patient",
        status="approved",
        rules=[
            {"source": "id", "target": "identifier[0].value"},
            {"source": "death_date", "target": "deceasedDateTime", "transform": "direct"},
        ]
    )

    test_inputs = [
        "2026-08-14T00:00:00",
        "2026-08-14 00:00:00.000",
        "2026-08-14 00:00:00",
        "2026-08-14",
        "08/14/2026",
    ]

    for val in test_inputs:
        res, errors = apply_mapping(mapping, {"id": "MEM001", "death_date": val})
        assert errors == [], f"Unexpected mapping error for {val}: {errors}"
        val_errors = validate_fhir(res)
        assert val_errors == [], f"FHIR validation failed for {val}: {val_errors}"


def test_all_columns_universal_dynamic_coercion():
    """Verify that universal dynamic coercion handles every column type:
    booleans ('1'/'0'/'Y'/'N'), decimals with currency/commas, integers,
    marital status codes ('Married' -> 'M'), postal codes ('90210.0' -> '90210'),
    gender normalization ('female'), and arbitrary extension choice types."""
    from app.mapping.engine import apply_mapping
    from app.mapping.models import MappingConfig
    from app.validation import validate_fhir

    mapping = MappingConfig(
        name="test_all_cols",
        target_resource="Patient",
        status="approved",
        rules=[
            {"source": "id", "target": "identifier[0].value", "required": True},
            {"source": "full_name", "target": "name[0].text"},
            {"source": "dob_raw", "target": "birthDate"},
            {"source": "death_raw", "target": "deceasedDateTime"},
            {"source": "is_active", "target": "active"},
            {"source": "is_twin", "target": "multipleBirthBoolean"},
            {"source": "num_children", "target": "extension[2].valueInteger"},
            {"source": "gender_str", "target": "gender"},
            {"source": "marital_str", "target": "maritalStatus.coding[0].code"},
            {"source": "income_str", "target": "extension[0].valueDecimal"},
            {"source": "zip_excel", "target": "address[0].postalCode"},
            {"source": "vip_flag", "target": "extension[1].valueBoolean"},
        ]
    )

    row = {
        "id": "MEM-ALL-01",
        "full_name": "  Dr. Jane Doe, MD  ",
        "dob_raw": "1980-05-20 00:00:00.000",
        "death_raw": "2026-08-14T00:00:00",
        "is_active": "ACTIVE",
        "is_twin": "Y",
        "num_children": "2.0",
        "gender_str": "FEMALE",
        "marital_str": "Married",
        "income_str": " $125,000.50 ",
        "zip_excel": "90210.0",
        "vip_flag": "1",
    }

    res, errors = apply_mapping(mapping, row)
    assert errors == [], f"Unexpected mapping errors: {errors}"
    assert res["name"][0]["text"] == "Dr. Jane Doe, MD"
    assert res["birthDate"] == "1980-05-20"
    assert res["deceasedDateTime"] == "2026-08-14"
    assert res["active"] is True
    assert res["multipleBirthBoolean"] is True
    assert res["extension"][2]["valueInteger"] == 2
    assert res["gender"] == "female"
    assert res["maritalStatus"]["coding"][0]["code"] == "M"
    assert res["extension"][0]["valueDecimal"] == 125000.50
    assert res["address"][0]["postalCode"] == "90210"
    assert res["extension"][1]["valueBoolean"] is True

    val_errors = validate_fhir(res)
    assert val_errors == [], f"FHIR validation failed: {val_errors}"


def test_upload_pipeline_scenario_reporting_and_quarantine():
    """Verify ingestion pipeline scenario tracking: validated, invalid, quarantined, and delivery actions."""
    from app.upload_pipeline import ingest_uploaded_records
    from app.mapping.models import MappingConfig, Rule

    mapping = MappingConfig(
        name="test_scenario_mapping",
        target_resource="Patient",
        status="approved",
        rules=[
            Rule(source="memid", target="identifier[0].value", transform="direct"),
            Rule(source="fullname", target="name[0].text", transform="direct"),
            Rule(source="gender", target="gender", transform="direct"),
            Rule(source="dob", target="birthDate", transform="date"),
        ]
    )

    rows = [
        # Valid record 1
        {"memid": "MEM001", "fullname": "Alice Smith", "gender": "female", "dob": "1990-01-01"},
        # Valid record 2
        {"memid": "MEM002", "fullname": "Bob Jones", "gender": "male", "dob": "1985-05-15"},
        # Invalid record (invalid birthDate regex in FHIR R4)
        {"memid": "MEM003", "fullname": "Charlie Invalid", "gender": "male", "dob": "not-a-date"},
    ]

    report = ingest_uploaded_records(medplum=None, rows=rows, mapping=mapping, dataset_name="test_dataset", dry_run=True)
    summary = report["summary"]
    results = report["results"]

    assert summary["total"] == 3
    assert summary["counts"]["dry_run"] == 2
    assert summary["counts"]["invalid"] == 1

    # Check valid dry run results
    r1 = results[0]
    assert r1["status"] == "dry_run"
    assert r1["mapping_details"]["delivery_action"] == "validated"
    assert r1["source_id"] == "MEM001"

    # Check quarantined invalid result
    r3 = results[2]
    assert r3["status"] == "invalid"
    assert r3["mapping_details"]["delivery_action"] == "quarantined"
    assert r3["mapping_details"]["error_category"] == "schema_validation"
    assert len(r3["errors"]) > 0


def test_stream_uploaded_records_scenario_counts():
    """Verify stream_uploaded_records yields scenario counts including created, updated, and quarantined."""
    from app.upload_pipeline import stream_uploaded_records
    from app.mapping.models import MappingConfig, Rule

    mapping = MappingConfig(
        name="test_stream_mapping",
        target_resource="Patient",
        status="approved",
        rules=[
            Rule(source="id", target="identifier[0].value", transform="direct"),
            Rule(source="name", target="name[0].text", transform="direct"),
            Rule(source="dob", target="birthDate", transform="direct"),
        ]
    )

    rows = [
        {"id": "S1", "name": "User 1", "dob": "1990-01-01"},
        {"id": "S2", "name": "User 2", "dob": "not-a-date"},
    ]

    events = list(stream_uploaded_records(medplum=None, rows=rows, mapping=mapping, dataset_name="stream_test", dry_run=True))
    assert len(events) == 3  # 2 record events + 1 complete event

    # Check record 1
    assert events[0]["type"] == "record"
    assert events[0]["result"]["status"] == "dry_run"
    assert events[0]["current_counts"]["dry_run"] == 1

    # Check record 2 (quarantined)
    assert events[1]["type"] == "record"
    assert events[1]["result"]["status"] == "invalid"
    assert events[1]["current_counts"]["invalid"] == 1

    # Check complete summary
    assert events[2]["type"] == "complete"
    assert events[2]["summary"]["total"] == 2
    assert events[2]["summary"]["counts"]["dry_run"] == 1
    assert events[2]["summary"]["counts"]["invalid"] == 1













