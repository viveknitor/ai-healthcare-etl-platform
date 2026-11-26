# Implementation Plan: Dynamic Dashboard Executive KPI Cards

## Goal Description
Currently, the 4 executive KPI cards on the **Overview Dashboard** (`ui/src/pages/OverviewDashboardPage.jsx`) display hardcoded static values:
- **Clinical Quality Rate**: `99.8% Certified`
- **Records Processed**: `1,420 Active`
- **AI Auto-Healed Rules**: `14 Gemini Flash`
- **Delivery Velocity**: `155 rec/s High-Speed`

This plan establishes a persistent backend telemetry and metrics tracking engine (`app/telemetry.py`), hooks into the execution pipelines (`upload_pipeline.py`, `pipeline.py`, and `auto_heal_endpoint`), exposes a dedicated `/stats/overview` endpoint, and connects `OverviewDashboardPage.jsx` to display live, verifiable operational figures with automatic updates.

---

## User Review Required

> [!IMPORTANT]
> **Baseline Seeding vs Fresh Zero State**:
> When a new user launches the platform without having run any pipelines yet, should the metrics:
> 1. Start with realistic historical baseline seed data (e.g., 1,420 processed records, 99.8% quality rate, 14 healed rules from the pre-configured `patient_mapping.json` test run) and dynamically increment from there as new pipelines run? *(Recommended)*
> 2. Or initialize at exact runtime zero (`0 records`, `100% quality`, `0 rules healed`, `0 rec/s`) until the user runs an ingestion file or HAPI sync?

---

## Proposed Architecture

```mermaid
flowchart TD
    subgraph Frontend["React UI (Overview Dashboard)"]
        UI[OverviewDashboardPage.jsx] -->|GET /stats/overview| API[api.js]
    end

    subgraph Backend["FastAPI Backend"]
        API --> Route["GET /stats/overview (app/main.py)"]
        Route --> Engine["TelemetryManager (app/telemetry.py)"]
        Engine --> Store[("telemetry_store.json (Persistence)")]
    end

    subgraph Ingestion["Pipeline Executions (Hooks)"]
        HAPI["HAPI -> Medplum Sync (pipeline.py)"] -->|record_batch()| Engine
        Upload["File Ingestion & SSE Stream (upload_pipeline.py)"] -->|record_batch() & record_throughput()| Engine
        AutoHeal["AI Self-Healing (auto_heal_endpoint)"] -->|record_heal()| Engine
    end
```

---

## Proposed Changes

### Backend Telemetry & Storage

#### [NEW] `app/telemetry.py`
A thread-safe singleton telemetry service `TelemetryManager` that:
1. Tracks:
   - `total_records_processed`: Total source records passed through the engine.
   - `valid_records`: Count of records successfully passing FHIR R4 schema validation.
   - `invalid_records`: Count of records failing validation (quarantined).
   - `delivered_records`: Count of records upserted to Medplum.
   - `ai_auto_healed_rules`: Total rules healed via closed-loop Gemini agent.
   - `peak_velocity_rec_per_sec`: Max observed streaming throughput.
   - `last_velocity_rec_per_sec`: Recent batch throughput.
   - `runs_history`: Recent execution timestamps, batch sizes, and durations.
2. Persists to `data/telemetry.json` (auto-created) with safe fallback and default baseline seeding.
3. Computes live KPIs:
   - **Quality Rate**: `round((valid_records / total_records_processed) * 100, 1)` (e.g. `99.8%`)
   - **Records Processed**: formatted with comma separator (e.g. `1,420`)
   - **Auto-Healed Rules**: total count
   - **Delivery Velocity**: peak/recent `rec/s` rate

```python
# app/telemetry.py snippet
class TelemetryManager:
    def record_run(self, total: int, valid: int, invalid: int, duration_sec: float):
        ...
    def record_heal(self, rule_count: int = 1):
        ...
    def get_summary(self) -> dict:
        ...
```

---

### Backend API Integration

#### [MODIFY] `app/main.py`
- Expose `GET /stats/overview` returning the aggregated KPI metrics.
- Expose `POST /stats/reset` (optional admin endpoint for demo reset).
- Hook `auto_heal_endpoint` to increment `telemetry.record_heal(len(changes))`.

#### [MODIFY] `app/upload_pipeline.py`
- In `ingest_uploaded_records` and `stream_uploaded_records`, record the execution duration and batch counts via `telemetry.record_run()`.

#### [MODIFY] `app/pipeline.py`
- In `run_hapi_to_medplum`, record execution summary to `telemetry.record_run()`.

---

### Frontend UI Integration

#### [MODIFY] `ui/src/api.js`
- Add `getDashboardStats: () => call("/stats/overview")`
- Add `resetDashboardStats: () => call("/stats/reset", {})`

#### [MODIFY] `ui/src/pages/OverviewDashboardPage.jsx`
- Replace hardcoded `MetricCard` props with dynamic state:
  ```jsx
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboardStats()
      .then(setStats)
      .catch((err) => console.error("Could not fetch live telemetry", err))
      .finally(() => setLoading(false));
  }, []);
  ```
- Render `MetricCard` using `stats.quality_rate`, `stats.records_processed`, `stats.auto_healed_rules`, and `stats.delivery_velocity`.
- Include a subtle "Live Telemetry" indicator badge and refresh icon.

---

## Verification Plan

### Automated Tests
1. **Unit tests for Telemetry Engine** (`tests/test_telemetry.py`):
   - Verify calculation of Clinical Quality Rate with various counts.
   - Verify calculation of delivery velocity (records / second).
   - Verify auto-heal counter increments.
   - Verify file persistence and reload from disk.
2. **API Endpoint Test** (`tests/test_main_telemetry.py`):
   - Test `GET /stats/overview` returns HTTP 200 with all required fields.
   - Run a test upload or mock pipeline run and verify `/stats/overview` reflects updated counts.
3. **Full regression suite**:
   - Run `pytest` to ensure all 34 existing tests continue to pass.

### Manual Verification
1. Launch UI (`npm run dev`) and backend (`uvicorn app.main:app`).
2. Open Overview Dashboard in browser: verify KPI numbers reflect the telemetry data.
3. Upload a sample CSV (e.g. `tests/fixtures` or custom CSV) via Ingestion Wizard:
   - Observe records processed count incrementing live.
   - Verify velocity is calculated based on upload stream speed.
4. Trigger an AI auto-heal in Mapping Studio:
   - Verify "AI Auto-Healed Rules" count increments dynamically.
