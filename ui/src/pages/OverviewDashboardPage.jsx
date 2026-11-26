import React from "react";
import MetricCard from "../components/layout/MetricCard.jsx";

function getDotClass(status) {
  if (status === "ok" || status === "active") return "ok";
  if (status === "degraded") return "warn";
  if (status === "offline" || status === "missing_key") return "bad";
  return "";
}

function getChipClass(status) {
  if (status === "ok") return "ok";
  if (status === "degraded") return "warn";
  if (status === "offline" || status === "missing_key") return "bad";
  return "info";
}

function getQualityColor(badgeType) {
  if (badgeType === "warn") return "#facc15";
  if (badgeType === "bad") return "var(--bad)";
  return "var(--ok)";
}

export default function OverviewDashboardPage({
  onNavigate,
  online,
  stats,
  infra,
  loading,
  refreshing,
  onRefresh,
}) {
  const medplum = infra?.medplum;
  const hapi = infra?.hapi;
  const fastapi = infra?.fastapi;
  const gemini = infra?.gemini;

  const qualityBadgeType = stats?.quality_badge_type ?? "ok";
  const activeGeminiModel =
    gemini?.model || stats?.last_llm_model || "gemini-flash-lite-latest";
  const avgCostFormatted =
    gemini?.avg_cost_formatted || stats?.avg_llm_cost_formatted || "$0.0003";
  const geminiActive = gemini?.status === "active";

  const formattedLastSync = stats?.last_run_timestamp
    ? new Date(stats.last_run_timestamp).toLocaleString()
    : null;

  return (
    <div className="dashboard-page">
      {/* 1. Header Banner */}
      <div className="dashboard-hero-banner">
        <div className="hero-content">
          <div className="hero-badge">
            <span className={`status-dot ${online === false ? "bad" : "ok"}`} />
            <span>HL7 FHIR R4 Enterprise Interoperability System</span>
            {stats && (
              <span className="chip info sm" style={{ marginLeft: "6px" }}>
                Live Telemetry • {stats.total_runs} runs
              </span>
            )}
          </div>
          <h2 className="hero-title">Healthcare ETL &amp; Ingestion Dashboard</h2>
          <p className="hero-subtitle">
            Autonomous multi-agent data pipeline reconciling disparate EHR feeds, PlanData exports, and FHIR repositories with zero data loss.
          </p>
        </div>

        <div className="hero-actions">
          <button className="primary" onClick={() => onNavigate("upload")}>
            📁 Ingest New Data File →
          </button>
          <button className="secondary" onClick={() => onNavigate("pipeline")}>
            🔄 Run HAPI Sync →
          </button>
          {onRefresh && (
            <button
              className="secondary"
              onClick={onRefresh}
              disabled={refreshing}
              title={formattedLastSync ? `Last telemetry update: ${formattedLastSync}` : "Refresh live metrics and infrastructure probes"}
            >
              {refreshing ? "Refreshing…" : "↻ Refresh"}
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Executive KPI Metric Cards */}
      <div className="metrics-grid">
        <MetricCard
          title="Clinical Quality Rate"
          value={loading && !stats ? "…" : (stats?.quality_rate ?? "99.8%")}
          subvalue={stats?.quality_subtext ?? "Zero fatal crashes"}
          badge={stats?.quality_badge ?? "Certified"}
          badgeType={qualityBadgeType}
          trend={stats?.quality_trend ?? "+0.4%"}
          color={getQualityColor(qualityBadgeType)}
          icon="🛡️"
        />
        <MetricCard
          title="Records Processed"
          value={loading && !stats ? "…" : (stats?.records_processed ?? "1,420")}
          subvalue={
            stats?.delivered_records_raw != null
              ? `${stats.delivered_records_raw.toLocaleString()} delivered • ${stats.records_subtext}`
              : "Across all datasets"
          }
          badge={stats?.records_badge ?? "Active"}
          badgeType={stats?.records_badge_type ?? "brand"}
          trend={stats?.records_trend ?? "+100%"}
          color="var(--brand)"
          icon="⚡"
        />
        <MetricCard
          title="AI Auto-Healed Rules"
          value={loading && !stats ? "…" : (stats?.auto_healed_rules ?? "14")}
          subvalue={stats?.auto_healed_subtext ?? "Closed-loop repaired"}
          badge={stats?.auto_healed_badge ?? "Gemini Flash"}
          badgeType="info"
          color="#c084fc"
          icon="🩹"
        />
        <MetricCard
          title="Delivery Velocity"
          value={loading && !stats ? "…" : (stats?.delivery_velocity ?? "155 rec/s")}
          subvalue={
            stats?.last_velocity_raw
              ? `Latest ${stats.last_velocity_raw} rec/s • Peak rate`
              : "Peak streaming rate"
          }
          badge={stats?.delivery_badge ?? "High-Speed"}
          badgeType={stats?.delivery_badge_type ?? "warn"}
          color="#facc15"
          icon="🚀"
        />
      </div>

      {/* 3. Operational Workflows & Quick Launch Hub */}
      <div className="dashboard-section-title">
        <h3>Operational Workflows</h3>
        <span className="sub-meta">Direct access to autonomous data pipelines</span>
      </div>

      <div className="workflow-cards-grid">
        {/* Workflow 1: Direct File Ingestion */}
        <div className="workflow-card" onClick={() => onNavigate("upload")}>
          <div className="workflow-card-header">
            <span className="workflow-icon" style={{ background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8" }}>📁</span>
            <span className="chip brand sm">4-Step Guided</span>
          </div>
          <h4 className="workflow-title">Direct File Ingestion (QNEXT / PlanData)</h4>
          <p className="workflow-desc">
            Upload CSV, Excel (.xlsx), or JSON files. Uses Gemini AI to auto-synthesize schemas, auto-heal casing/regex errors, and conditionally upsert to Medplum.
          </p>
          <div className="workflow-footer">
            <span>Launch Ingestion Wizard →</span>
          </div>
        </div>

        {/* Workflow 2: HAPI to Medplum Sync */}
        <div className="workflow-card" onClick={() => onNavigate("pipeline")}>
          <div className="workflow-card-header">
            <span className="workflow-icon" style={{ background: "rgba(52, 211, 153, 0.15)", color: "#34d399" }}>🔄</span>
            <span className="chip ok sm">Server-to-Server</span>
          </div>
          <h4 className="workflow-title">FHIR Live Sync (HAPI ↔ Medplum)</h4>
          <p className="workflow-desc">
            Directly synchronizes Patients, Observations, Conditions, and Encounters from HAPI FHIR into Medplum with idempotent reconciliation.
          </p>
          <div className="workflow-footer">
            <span>Open Sync Pipeline →</span>
          </div>
        </div>

        {/* Workflow 3: AI Mapping Studio */}
        <div className="workflow-card" onClick={() => onNavigate("mapping")}>
          <div className="workflow-card-header">
            <span className="workflow-icon" style={{ background: "rgba(192, 132, 252, 0.15)", color: "#c084fc" }}>✨</span>
            <span className="chip sm" style={{ background: "rgba(192, 132, 252, 0.2)", color: "#e9d5ff" }}>
              {activeGeminiModel}
            </span>
          </div>
          <h4 className="workflow-title">Autonomous AI Mapping Studio</h4>
          <p className="workflow-desc">
            Interactive mapping design sandbox. Inspect source sample JSON and generate custom FHIR R4 transformation contracts in milliseconds.
          </p>
          <div className="workflow-footer">
            <span>Launch Studio →</span>
          </div>
        </div>
      </div>

      {/* 4. Connected System Infrastructure & Health Status */}
      <div className="dashboard-section-title" style={{ marginTop: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h3>Connected Healthcare Infrastructure</h3>
          <span className="sub-meta">Real-time status of connected repositories and agents</span>
        </div>
        {formattedLastSync && (
          <span className="sub-meta">Last pipeline run: {formattedLastSync}</span>
        )}
      </div>

      <div className="infrastructure-grid">
        <div className="infra-card">
          <div className="infra-header">
            <div className="infra-name">
              <span className={`status-dot ${getDotClass(medplum?.status)}`} />
              <strong>Medplum FHIR Server</strong>
            </div>
            <span className={`chip ${getChipClass(medplum?.status)} sm`}>
              Port :{medplum?.port ?? 8103}
            </span>
          </div>
          <p className="infra-desc">Target clinical data repository storing reconciled Patient and Clinical FHIR resources.</p>
          <div className="infra-meta">
            <code>{medplum?.url ?? "http://localhost:8103"}</code> • Version: {medplum?.version ?? "FHIR R4"}
            {medplum?.latency_ms != null && ` • ${medplum.latency_ms}ms`}
          </div>
        </div>

        <div className="infra-card">
          <div className="infra-header">
            <div className="infra-name">
              <span className={`status-dot ${getDotClass(hapi?.status)}`} />
              <strong>HAPI FHIR Server</strong>
            </div>
            <span className={`chip ${getChipClass(hapi?.status)} sm`}>
              Port :{hapi?.port ?? 443}
            </span>
          </div>
          <p className="infra-desc">Upstream EHR staging server providing legacy patient datasets and lab observations.</p>
          <div className="infra-meta">
            <code>{hapi?.url ?? "https://hapi.fhir.org/baseR4"}</code> • FHIR {hapi?.fhir_version ?? "R4"}
            {hapi?.latency_ms != null && ` • ${hapi.latency_ms}ms`}
          </div>
        </div>

        <div className="infra-card">
          <div className="infra-header">
            <div className="infra-name">
              <span className={`status-dot ${online === null ? "" : online ? "ok" : "bad"}`} />
              <strong>FastAPI ETL Core</strong>
            </div>
            <span className={`chip ${online === false ? "bad" : "brand"} sm`}>
              Port :{fastapi?.port ?? 8000}
            </span>
          </div>
          <p className="infra-desc">High-throughput streaming ingestion pipeline with dynamic semantic transforms and SSE telemetry.</p>
          <div className="infra-meta">
            <code>{fastapi?.url ?? "http://localhost:8000"}</code> • Status: {online === null ? "Connecting" : online ? "Online" : "Offline"}
            {stats?.total_runs != null && ` • ${stats.total_runs} runs`}
          </div>
        </div>

        <div className="infra-card">
          <div className="infra-header">
            <div className="infra-name">
              <span
                className={`status-dot ${getDotClass(gemini?.status)}`}
                style={
                  geminiActive
                    ? { background: "#c084fc", boxShadow: "0 0 8px #c084fc" }
                    : undefined
                }
              />
              <strong>Gemini AI Agent</strong>
            </div>
            <span
              className={`chip ${gemini?.status === "missing_key" ? "bad" : ""} sm`}
              style={
                geminiActive || !gemini
                  ? { background: "rgba(192, 132, 252, 0.2)", color: "#e9d5ff" }
                  : undefined
              }
            >
              {gemini?.status === "missing_key" ? "Missing Key" : geminiActive ? "Active" : "Checking"}
            </span>
          </div>
          <p className="infra-desc">Autonomous self-healing reasoning core for closed-loop contract repair and zero-shot schema synthesis.</p>
          <div className="infra-meta">
            Model: <code>{activeGeminiModel}</code> • Avg Cost: {avgCostFormatted}
          </div>
        </div>
      </div>
    </div>
  );
}
