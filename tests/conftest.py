import pytest

from app import main as app_main
from app.telemetry import telemetry


@pytest.fixture(autouse=True)
def isolate_telemetry_store(tmp_path, monkeypatch):
    """Ensure every test runs against an isolated temp telemetry file rather than workspace data/telemetry.json."""
    test_store = tmp_path / "telemetry.json"
    monkeypatch.setattr(telemetry, "_store_path", test_store)
    telemetry.reset(use_baseline=True)
    app_main._INFRA_CACHE["payload"] = None
    app_main._INFRA_CACHE["expires_at"] = 0.0
    yield
    app_main._INFRA_CACHE["payload"] = None
    app_main._INFRA_CACHE["expires_at"] = 0.0
