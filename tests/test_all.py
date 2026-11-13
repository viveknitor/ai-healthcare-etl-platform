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
