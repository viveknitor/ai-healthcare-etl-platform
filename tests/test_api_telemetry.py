import json
from types import SimpleNamespace

import httpx
from starlette.testclient import TestClient

from app import main as app_main
from app.connectors.hapi import HapiClient
from app.main import app
from app.mapping.models import MappingConfig
from app.pipeline import run_hapi_to_medplum
from app.upload_pipeline import ingest_uploaded_records, stream_uploaded_records

client = TestClient(app)


def test_stats_overview_and_reset_endpoints():
    resp = client.get("/stats/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["quality_rate"] == "99.8%"
    assert data["records_processed"] == "1,420"
    assert data["auto_healed_rules"] == "14"
    assert data["delivery_velocity"] == "155 rec/s"

    reset_zero = client.post("/stats/reset?baseline=false")
    assert reset_zero.status_code == 200
    assert reset_zero.json()["summary"]["records_processed_raw"] == 0

    reset_base = client.post("/stats/reset?baseline=true")
    assert reset_base.status_code == 200
    assert reset_base.json()["summary"]["records_processed_raw"] == 1420


def test_stats_infrastructure_probes_live_urls(monkeypatch):
    def mock_handler(req: httpx.Request):
        if str(req.url) == "http://medplum.local:9103/healthcheck":
            return httpx.Response(200, json={"ok": True, "version": "3.2.0", "postgres": True, "redis": True})
        if str(req.url) == "https://hapi.fhir.org/baseR4/metadata?_summary=true":
            return httpx.Response(200, json={"resourceType": "CapabilityStatement", "fhirVersion": "4.0.1"})
        return httpx.Response(404)

    transport = httpx.MockTransport(mock_handler)
    real_async_client = httpx.AsyncClient

    def patched_async_client(*args, **kwargs):
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(app_main.httpx, "AsyncClient", patched_async_client)
    monkeypatch.setattr(
        app_main,
        "get_settings",
        lambda: SimpleNamespace(
            medplum_base_url="http://medplum.local:9103",
            hapi_base_url="https://hapi.fhir.org/baseR4",
            medplum_client_id="cid",
            medplum_client_secret="csec",
            gemini_api_key="test-key",
            gemini_model="gemini-flash-lite-latest",
        ),
    )

    resp = client.get("/stats/infrastructure?refresh=true")
    assert resp.status_code == 200
    body = resp.json()
    assert body["medplum"]["status"] == "ok"
    assert body["medplum"]["port"] == 9103
    assert body["medplum"]["version"] == "3.2.0"
    assert body["medplum"]["postgres"] is True
    assert body["medplum"]["oauth_configured"] is True

    assert body["hapi"]["status"] == "ok"
    assert body["hapi"]["port"] == 443
    assert body["hapi"]["fhir_version"] == "4.0.1"

    assert body["fastapi"]["status"] == "ok"
    assert body["fastapi"]["port"] == 8000
    assert body["gemini"]["status"] == "active"
    assert body["gemini"]["model"] == "gemini-flash-lite-latest"


def test_pipeline_and_ai_hooks_update_overview(monkeypatch):
    client.post("/stats/reset?baseline=false")

    mapping = MappingConfig(
        name="hook_test",
        target_resource="Patient",
        status="approved",
        rules=[{"source": "id", "target": "identifier[0].value"}],
    )

    # 1. Batch upload dry-run
    ingest_uploaded_records(None, [{"id": "P1"}, {"id": "P2"}], mapping, dataset_name="batch", dry_run=True)

    # 2. SSE stream partial abort after 1 record (finally hook must still capture)
    gen = stream_uploaded_records(None, [{"id": "P3"}, {"id": "P4"}], mapping, dataset_name="stream", dry_run=True)
    next(gen)
    gen.close()

    # 3. HAPI sync dry-run
    hapi_transport = httpx.MockTransport(
        lambda r: httpx.Response(200, json={"entry": [{"resource": {"resourceType": "Patient", "id": "H1"}}]})
    )
    run_hapi_to_medplum(HapiClient("https://hapi.example", transport=hapi_transport), None, count=1, dry_run=True)

    # 4. Suggest & Auto-heal endpoints
    monkeypatch.setattr(
        app_main,
        "get_settings",
        lambda: SimpleNamespace(
            medplum_base_url="http://localhost:8103",
            hapi_base_url="https://hapi.fhir.org/baseR4",
            medplum_client_id="",
            medplum_client_secret="",
            gemini_api_key="key",
            gemini_model="gemini-flash-lite-latest",
        ),
    )
    suggested_cfg = MappingConfig(
        name="patient_mapping",
        target_resource="Patient",
        status="pending_review",
        metadata={"llm_metrics": {"model": "gemini-flash-lite-latest", "total_tokens": 500, "cost_usd": 0.0002}},
        rules=[{"source": "id", "target": "identifier[0].value"}],
    )
    healed_cfg = MappingConfig(
        name="patient_mapping",
        target_resource="Patient",
        status="pending_review",
        metadata={"llm_metrics": {"model": "gemini-flash-lite-latest", "total_tokens": 700, "cost_usd": 0.0004}},
        rules=[{"source": "id", "target": "identifier[0].value"}],
    )
    monkeypatch.setattr(app_main, "suggest_mapping", lambda *a, **kw: suggested_cfg)
    monkeypatch.setattr(app_main, "heal_mapping_config", lambda *a, **kw: (healed_cfg, ["fix 1", "fix 2"]))

    r_sug = client.post("/mappings/suggest", json={"sample": {"id": "1"}, "target_resource": "Patient"})
    assert r_sug.status_code == 200
    r_heal = client.post(
        "/mappings/auto-heal",
        json={"mapping": json.loads(suggested_cfg.model_dump_json()), "sample": {"id": "1"}, "errors": ["err"]},
    )
    assert r_heal.status_code == 200

    overview = client.get("/stats/overview").json()
    assert overview["records_processed_raw"] == 4  # 2 batch + 1 partial stream + 1 HAPI
    assert overview["auto_healed_raw"] == 2
    assert overview["llm_calls"] == 2
    assert overview["total_runs"] == 3
    assert overview["avg_llm_cost_formatted"] == "$0.0003"
