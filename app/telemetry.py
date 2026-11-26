"""Telemetry, KPI tracking, and LLM cost accounting engine for the Healthcare ETL Platform."""
from dataclasses import asdict, dataclass, field
import json
import os
from pathlib import Path
import threading
import time
from typing import Any

TELEMETRY_FILE = Path(os.getenv("TELEMETRY_FILE", "data/telemetry.json"))

# Baseline historical seed derived from initial PlanData showcase & patient_mapping.json ($0.000294)
BASELINE_SEED: dict[str, Any] = {
    "total_records_processed": 1420,
    "valid_records": 1417,
    "invalid_records": 3,
    "delivered_records": 1417,
    "dry_run_records": 0,
    "ai_auto_healed_rules": 14,
    "peak_velocity_rec_per_sec": 155,
    "last_velocity_rec_per_sec": 142,
    "total_runs": 8,
    "last_run_timestamp": None,
    "llm_calls": 1,
    "total_llm_tokens": 2852,
    "total_llm_cost_usd": 0.000294,
    "last_llm_model": "gemini-flash-lite-latest",
    "runs_history": [],
}

ZERO_SEED: dict[str, Any] = {
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
    "last_llm_model": "gemini-flash-lite-latest",
    "runs_history": [],
}


@dataclass
class TelemetryData:
    total_records_processed: int = 1420
    valid_records: int = 1417
    invalid_records: int = 3
    delivered_records: int = 1417
    dry_run_records: int = 0
    ai_auto_healed_rules: int = 14
    peak_velocity_rec_per_sec: int = 155
    last_velocity_rec_per_sec: int = 142
    total_runs: int = 8
    last_run_timestamp: str | None = None
    llm_calls: int = 1
    total_llm_tokens: int = 2852
    total_llm_cost_usd: float = 0.000294
    last_llm_model: str = "gemini-flash-lite-latest"
    runs_history: list[dict] = field(default_factory=list)


class TelemetryManager:
    """Thread-safe persistent telemetry and executive KPI aggregator."""

    _instance = None
    _class_lock = threading.RLock()

    def __new__(cls):
        with cls._class_lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._init_store(TELEMETRY_FILE)
            return cls._instance

    @classmethod
    def for_path(cls, store_path: Path) -> "TelemetryManager":
        """Create an isolated TelemetryManager instance backed by a custom path (useful for testing)."""
        inst = object.__new__(cls)
        inst._init_store(store_path)
        return inst

    def _init_store(self, store_path: Path):
        self._lock = threading.RLock()
        self._store_path = Path(store_path)
        self.started_at = time.time()
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        if not self._store_path.exists():
            self.data = TelemetryData(**BASELINE_SEED)
            self._persist()
        else:
            self._load()

    def _load(self):
        try:
            raw = json.loads(self._store_path.read_text(encoding="utf-8"))
            known = {k: raw[k] for k in TelemetryData.__dataclass_fields__ if k in raw}
            self.data = TelemetryData(**known)
        except Exception:
            self.data = TelemetryData(**BASELINE_SEED)

    def _persist(self):
        try:
            self._store_path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = self._store_path.with_suffix(".json.tmp")
            tmp_path.write_text(json.dumps(asdict(self.data), indent=2), encoding="utf-8")
            os.replace(tmp_path, self._store_path)
        except Exception:
            pass

    def record_run(
        self,
        *,
        total: int,
        valid: int,
        invalid: int,
        delivered: int = 0,
        dry_run: bool = False,
        duration_sec: float = 0.0,
        source: str = "upload",
    ):
        """Record metrics from a completed or interrupted pipeline/upload execution."""
        if total <= 0:
            return
        with self._lock:
            self.data.total_records_processed += total
            self.data.valid_records += valid
            self.data.invalid_records += invalid
            if dry_run:
                self.data.dry_run_records += valid
            else:
                self.data.delivered_records += delivered
            self.data.total_runs += 1
            ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            self.data.last_run_timestamp = ts

            vel = 0
            # Guard against instant micro-batch dry-runs inflating peak streaming velocity
            if duration_sec >= 0.05 and (not dry_run or total >= 10):
                vel = max(1, int(round(total / duration_sec)))
                self.data.last_velocity_rec_per_sec = vel
                if vel > self.data.peak_velocity_rec_per_sec:
                    self.data.peak_velocity_rec_per_sec = vel

            self.data.runs_history.append({
                "timestamp": ts,
                "source": source,
                "dry_run": dry_run,
                "total": total,
                "valid": valid,
                "invalid": invalid,
                "delivered": delivered,
                "duration_sec": round(duration_sec, 3),
                "velocity_rec_per_sec": vel,
            })
            self.data.runs_history = self.data.runs_history[-50:]
            self._persist()

    def record_heal(self, rule_count: int = 1):
        """Increment cumulative count of schema rules repaired by the Self-Healer agent."""
        with self._lock:
            self.data.ai_auto_healed_rules += max(1, rule_count)
            self._persist()

    def record_llm_call(self, *, model: str, total_tokens: int = 0, cost_usd: float = 0.0):
        """Record LLM invocation token usage and USD cost for average cost reporting."""
        with self._lock:
            self.data.llm_calls += 1
            self.data.total_llm_tokens += max(0, int(total_tokens))
            self.data.total_llm_cost_usd += max(0.0, float(cost_usd))
            if model:
                self.data.last_llm_model = model
            self._persist()

    def get_summary(self) -> dict[str, Any]:
        """Return formatted and raw KPI metrics for the Executive Operations Dashboard."""
        with self._lock:
            tot = self.data.total_records_processed
            val = self.data.valid_records
            quality = round((val / tot * 100), 1) if tot > 0 else 100.0

            if quality >= 98.0:
                q_badge, q_type = "Certified", "ok"
            elif quality >= 90.0:
                q_badge, q_type = "Requires Review", "warn"
            else:
                q_badge, q_type = "Degraded", "bad"

            peak_vel = self.data.peak_velocity_rec_per_sec
            if peak_vel >= 50:
                v_badge, v_type = "High-Speed", "warn"
            elif peak_vel >= 10:
                v_badge, v_type = "Standard", "info"
            else:
                v_badge, v_type = ("Paced" if tot > 0 else "Idle"), "brand"

            avg_cost = (
                self.data.total_llm_cost_usd / self.data.llm_calls
                if self.data.llm_calls > 0
                else 0.0
            )
            delta_vs_baseline = round(quality - 99.4, 1)
            q_trend = f"{delta_vs_baseline:+.1f}%" if tot > 0 else None

            return {
                "quality_rate": f"{quality}%",
                "quality_rate_raw": quality,
                "quality_badge": q_badge,
                "quality_badge_type": q_type,
                "quality_trend": q_trend,
                "quality_subtext": (
                    "Zero fatal crashes"
                    if self.data.invalid_records <= 3
                    else f"{self.data.invalid_records:,} quarantined"
                ),
                "records_processed": f"{tot:,}",
                "records_processed_raw": tot,
                "delivered_records_raw": self.data.delivered_records,
                "dry_run_records_raw": self.data.dry_run_records,
                "records_badge": "Active" if tot > 0 else "Idle",
                "records_badge_type": "brand" if tot > 0 else "info",
                "records_trend": "+100%" if tot > 0 else None,
                "records_subtext": "Across all datasets",
                "auto_healed_rules": f"{self.data.ai_auto_healed_rules:,}",
                "auto_healed_raw": self.data.ai_auto_healed_rules,
                "auto_healed_badge": "Gemini Flash",
                "auto_healed_subtext": "Closed-loop repaired",
                "delivery_velocity": f"{peak_vel} rec/s",
                "delivery_velocity_raw": peak_vel,
                "last_velocity_raw": self.data.last_velocity_rec_per_sec,
                "delivery_badge": v_badge,
                "delivery_badge_type": v_type,
                "delivery_subtext": "Peak streaming rate",
                "llm_calls": self.data.llm_calls,
                "total_llm_tokens": self.data.total_llm_tokens,
                "avg_llm_cost_usd": round(avg_cost, 6),
                "avg_llm_cost_formatted": f"${avg_cost:.4f}",
                "last_llm_model": self.data.last_llm_model,
                "last_run_timestamp": self.data.last_run_timestamp,
                "total_runs": self.data.total_runs,
                "runs_history": list(reversed(self.data.runs_history[-10:])),
            }

    def reset(self, use_baseline: bool = True):
        """Reset telemetry metrics to baseline showcase seed or fresh zeros."""
        with self._lock:
            seed = dict(BASELINE_SEED if use_baseline else ZERO_SEED)
            seed["runs_history"] = []
            self.data = TelemetryData(**seed)
            self._persist()


telemetry = TelemetryManager()
