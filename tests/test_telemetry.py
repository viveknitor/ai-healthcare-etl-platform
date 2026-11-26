from app.telemetry import TelemetryManager


def test_telemetry_singleton_identity():
    assert TelemetryManager() is TelemetryManager()


def test_baseline_seed_summary(tmp_path):
    tm = TelemetryManager.for_path(tmp_path / "t.json")
    s = tm.get_summary()
    assert s["quality_rate"] == "99.8%"
    assert s["quality_badge"] == "Certified"
    assert s["quality_badge_type"] == "ok"
    assert s["records_processed"] == "1,420"
    assert s["records_badge"] == "Active"
    assert s["auto_healed_rules"] == "14"
    assert s["delivery_velocity"] == "155 rec/s"
    assert s["delivery_badge"] == "High-Speed"
    assert s["avg_llm_cost_formatted"] == "$0.0003"


def test_quality_rate_thresholds_and_zero_state(tmp_path):
    tm = TelemetryManager.for_path(tmp_path / "t.json")
    tm.reset(use_baseline=False)
    zero = tm.get_summary()
    assert zero["quality_rate"] == "100.0%"
    assert zero["records_processed"] == "0"
    assert zero["records_badge"] == "Idle"

    # 95 / 100 = 95.0% -> Requires Review
    tm.record_run(total=100, valid=95, invalid=5, delivered=95, dry_run=False, duration_sec=1.0)
    s_warn = tm.get_summary()
    assert s_warn["quality_rate"] == "95.0%"
    assert s_warn["quality_badge"] == "Requires Review"
    assert s_warn["quality_badge_type"] == "warn"

    # Drop below 90% -> Degraded
    tm.record_run(total=100, valid=80, invalid=20, delivered=80, dry_run=False, duration_sec=1.0)
    s_bad = tm.get_summary()
    assert s_bad["quality_rate"] == "87.5%"
    assert s_bad["quality_badge"] == "Degraded"
    assert s_bad["quality_badge_type"] == "bad"


def test_dry_run_isolation_and_velocity_safeguard(tmp_path):
    tm = TelemetryManager.for_path(tmp_path / "t.json")
    tm.reset(use_baseline=False)

    # Tiny 3-row instant dry-run must not inflate peak velocity or delivered_records
    tm.record_run(total=3, valid=3, invalid=0, delivered=0, dry_run=True, duration_sec=0.002)
    s1 = tm.get_summary()
    assert s1["records_processed_raw"] == 3
    assert s1["delivered_records_raw"] == 0
    assert s1["dry_run_records_raw"] == 3
    assert s1["delivery_velocity_raw"] == 0

    # Live delivery batch updates delivered_records and peak velocity
    tm.record_run(total=200, valid=200, invalid=0, delivered=200, dry_run=False, duration_sec=1.0)
    s2 = tm.get_summary()
    assert s2["delivered_records_raw"] == 200
    assert s2["delivery_velocity_raw"] == 200
    assert s2["delivery_velocity"] == "200 rec/s"

    # Slower batch preserves peak velocity while updating last velocity
    tm.record_run(total=50, valid=50, invalid=0, delivered=50, dry_run=False, duration_sec=1.0)
    s3 = tm.get_summary()
    assert s3["delivery_velocity_raw"] == 200
    assert s3["last_velocity_raw"] == 50


def test_heal_llm_cost_and_disk_persistence(tmp_path):
    store = tmp_path / "persist.json"
    tm = TelemetryManager.for_path(store)
    tm.reset(use_baseline=False)
    tm.record_heal(3)
    tm.record_llm_call(model="gemini-3.5-flash", total_tokens=1000, cost_usd=0.0004)
    tm.record_llm_call(model="gemini-flash-lite-latest", total_tokens=500, cost_usd=0.0002)

    reloaded = TelemetryManager.for_path(store)
    s = reloaded.get_summary()
    assert s["auto_healed_raw"] == 3
    assert s["llm_calls"] == 2
    assert s["total_llm_tokens"] == 1500
    assert abs(s["avg_llm_cost_usd"] - 0.0003) < 1e-6
    assert s["last_llm_model"] == "gemini-flash-lite-latest"


def test_corrupt_store_falls_back_to_baseline(tmp_path):
    store = tmp_path / "corrupt.json"
    store.write_text("{not valid json", encoding="utf-8")
    tm = TelemetryManager.for_path(store)
    assert tm.get_summary()["records_processed_raw"] == 1420
