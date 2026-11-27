from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_TELEMETRY_PATH = Path(__file__).resolve().parent.parent / "data" / "telemetry.json"


def _empty_state() -> dict[str, Any]:
    return {
        "total_records_processed": 0,
        "valid_records": 0,
        "invalid_records": 0,
        "delivered_records": 0,
        "dry_run_records": 0,
        "ai_auto_healed_rules": 0,
        "peak_velocity_rec_per_sec": 0,
        "last_velocity_rec_per_sec": 0,
        "total_runs": 0,
        "last_run_timestamp": None,
        "llm_calls": 0,
        "total_llm_tokens": 0,
        "total_llm_cost_usd": 0.0,
        "last_llm_model": None,
        "runs_history": [],
    }


class TelemetryManager:
    """Thread-safe telemetry aggregator persisted to JSON."""

    def __init__(self, storage_path: Path | str | None = None, persist: bool | None = None):
        self.storage_path = Path(storage_path) if storage_path else DEFAULT_TELEMETRY_PATH
        self._explicit_path = storage_path is not None
        self._persist_override = persist
        self.started_at = time.time()
        self._lock = threading.Lock()
        self._state = self._load()

    def _should_persist(self) -> bool:
        if self._persist_override is not None:
            return self._persist_override
        if os.getenv("PYTEST_CURRENT_TEST") and not self._explicit_path:
            return False
        return True

    def _load(self) -> dict[str, Any]:
        base = _empty_state()
        if self.storage_path.exists():
            try:
                loaded = json.loads(self.storage_path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    base.update(loaded)
            except Exception:
                pass
        return base

    def _save(self) -> None:
        if not self._should_persist():
            return
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.storage_path.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(self._state, indent=2), encoding="utf-8")
        tmp_path.replace(self.storage_path)

    def record_run(
        self,
        *,
        source: str,
        total: int,
        valid: int,
        invalid: int,
        delivered: int,
        dry_run: bool,
        duration_sec: float,
    ) -> dict[str, Any]:
        with self._lock:
            now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            safe_duration = max(float(duration_sec), 0.001)
            velocity = int(round(total / safe_duration)) if total > 0 and duration_sec >= 0.05 else 0

            self._state["total_records_processed"] += max(0, int(total))
            self._state["valid_records"] += max(0, int(valid))
            self._state["invalid_records"] += max(0, int(invalid))
            self._state["delivered_records"] += max(0, int(delivered))
            if dry_run:
                self._state["dry_run_records"] += max(0, int(valid))
            self._state["total_runs"] += 1
            self._state["last_run_timestamp"] = now
            self._state["last_velocity_rec_per_sec"] = velocity
            if velocity > self._state["peak_velocity_rec_per_sec"]:
                self._state["peak_velocity_rec_per_sec"] = velocity

            entry = {
                "timestamp": now,
                "source": source,
                "dry_run": bool(dry_run),
                "total": int(total),
                "valid": int(valid),
                "invalid": int(invalid),
                "delivered": int(delivered),
                "duration_sec": round(float(duration_sec), 3),
                "velocity_rec_per_sec": velocity,
            }
            history = list(self._state.get("runs_history") or [])
            history.append(entry)
            self._state["runs_history"] = history[-25:]
            self._save()
            return entry

    def record_heal(self, rule_count: int = 1) -> None:
        with self._lock:
            self._state["ai_auto_healed_rules"] += max(0, int(rule_count))
            self._save()

    def record_llm_usage(
        self,
        *,
        tokens: int = 0,
        cost_usd: float = 0.0,
        model: str | None = None,
    ) -> None:
        with self._lock:
            self._state["llm_calls"] += 1
            self._state["total_llm_tokens"] += max(0, int(tokens or 0))
            self._state["total_llm_cost_usd"] += max(0.0, float(cost_usd or 0.0))
            if model:
                self._state["last_llm_model"] = model
            self._save()

    def reset(self) -> dict[str, Any]:
        with self._lock:
            self._state = _empty_state()
            self._save()
            return self._compute_summary_unlocked()

    def _compute_summary_unlocked(self) -> dict[str, Any]:
        s = dict(self._state)
        total = s["total_records_processed"]
        valid = s["valid_records"]
        quality_rate = round((valid / total) * 100, 1) if total > 0 else 100.0
        cost = float(s.get("total_llm_cost_usd") or 0.0)
        calls = max(1, int(s.get("llm_calls") or 0))
        avg_cost = cost / calls if s.get("llm_calls") else 0.0003
        return {
            **s,
            "quality_rate": quality_rate,
            "records_processed": total,
            "records_processed_formatted": f"{total:,}",
            "auto_healed_rules": s["ai_auto_healed_rules"],
            "delivery_velocity": s["peak_velocity_rec_per_sec"],
            "total_llm_cost_formatted": f"${cost:.4f}",
            "avg_llm_cost_formatted": f"${avg_cost:.4f}",
        }

    def get_summary(self) -> dict[str, Any]:
        with self._lock:
            return self._compute_summary_unlocked()


telemetry = TelemetryManager()
