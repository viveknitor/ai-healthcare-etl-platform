from app.telemetry import TelemetryManager


def test_telemetry_manager_records_and_persists(tmp_path):
    store_file = tmp_path / "telemetry.json"
    tm = TelemetryManager(storage_path=store_file, persist=True)

    summary_initial = tm.get_summary()
    assert summary_initial["total_records_processed"] == 0
    assert summary_initial["quality_rate"] == 100.0

    tm.record_run(
        source="stream:PlanData",
        total=100,
        valid=98,
        invalid=2,
        delivered=98,
        dry_run=False,
        duration_sec=0.5,
    )
    tm.record_heal(3)
    tm.record_llm_usage(tokens=450, cost_usd=0.00045, model="gemini-flash-lite-latest")

    # Reload from disk
    tm_reloaded = TelemetryManager(storage_path=store_file, persist=True)
    summary = tm_reloaded.get_summary()
    assert summary["total_records_processed"] == 100
    assert summary["valid_records"] == 98
    assert summary["invalid_records"] == 2
    assert summary["delivered_records"] == 98
    assert summary["quality_rate"] == 98.0
    assert summary["ai_auto_healed_rules"] == 3
    assert summary["peak_velocity_rec_per_sec"] == 200
    assert summary["total_llm_tokens"] == 450
    assert len(summary["runs_history"]) == 1

    reset_summary = tm_reloaded.reset()
    assert reset_summary["total_records_processed"] == 0
    assert reset_summary["runs_history"] == []


def test_stats_and_health_endpoints(tmp_path, monkeypatch):
    from starlette.testclient import TestClient
    import app.main as main_mod

    isolated_tm = TelemetryManager(storage_path=tmp_path / "telemetry_api.json", persist=True)
    isolated_tm.record_run(
        source="stream:EndpointTest",
        total=20,
        valid=19,
        invalid=1,
        delivered=19,
        dry_run=False,
        duration_sec=0.25,
    )
    monkeypatch.setattr(main_mod, "telemetry", isolated_tm)
    main_mod._INFRA_CACHE["payload"] = None
    main_mod._INFRA_CACHE["expires_at"] = 0.0

    async def fake_medplum(client, medplum_url, oauth_configured):
        return {
            "status": "online",
            "oauth": "configured" if oauth_configured else "missing",
            "url": medplum_url,
            "latency_ms": 12,
        }

    async def fake_hapi(client, hapi_url):
        return {
            "status": "offline",
            "port": 8090,
            "url": hapi_url,
            "fhir_version": "R4",
            "latency_ms": None,
        }

    monkeypatch.setattr(main_mod, "_probe_medplum", fake_medplum)
    monkeypatch.setattr(main_mod, "_probe_hapi", fake_hapi)

    client = TestClient(main_mod.app)

    overview = client.get("/stats/overview")
    assert overview.status_code == 200
    ov_data = overview.json()
    assert ov_data["total_records_processed"] == 20
    assert ov_data["quality_rate"] == 95.0

    infra = client.get("/stats/infrastructure?refresh=true")
    assert infra.status_code == 200
    infra_data = infra.json()
    assert infra_data["fastapi"]["status"] == "ok"
    assert infra_data["medplum"]["status"] == "online"
    assert infra_data["hapi"]["status"] == "offline"
    assert "gemini" in infra_data

    alias_resp = client.get("/health/services")
    assert alias_resp.status_code == 200
    assert alias_resp.json()["fastapi"]["total_runs"] == 1

    reset_resp = client.post("/stats/reset")
    assert reset_resp.status_code == 200
    assert reset_resp.json()["ok"] is True
    assert reset_resp.json()["summary"]["total_records_processed"] == 0
