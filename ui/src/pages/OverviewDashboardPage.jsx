import React from "react";
import MetricCard from "../components/layout/MetricCard.jsx";

export default function OverviewDashboardPage({ onNavigate, online }) {
  return (
    <div className="dashboard-page">
      {/* 1. Header Banner */}
      <div className="dashboard-hero-banner">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="status-dot ok" />
            <span>HL7 FHIR R4 Enterprise Interoperability System</span>
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
        </div>
      </div>

      {/* 2. Top Executive KPI Metric Cards */}
      <div className="metrics-grid">
        <MetricCard
          title="Clinical Quality Rate"
          value="99.8%"
          subvalue="Zero fatal crashes"
          badge="Certified"
          badgeType="ok"
          trend="+0.4%"
          color="var(--ok)"
          icon="🛡️"
        />
        <MetricCard
          title="Records Processed"
          value="1,420"
          subvalue="Across all datasets"
          badge="Active"
          badgeType="brand"
          trend="+100%"
          color="var(--brand)"
          icon="⚡"
        />
        <MetricCard
          title="AI Auto-Healed Rules"
          value="14"
          subvalue="Closed-loop repaired"
          badge="Gemini Flash"
          badgeType="info"
          color="#c084fc"
          icon="🩹"
        />
        <MetricCard
          title="Delivery Velocity"
          value="155 rec/s"
          subvalue="Peak streaming rate"
          badge="High-Speed"
          badgeType="warn"
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
            <span className="chip sm" style={{ background: "rgba(192, 132, 252, 0.2)", color: "#e9d5ff" }}>Gemini 2.5 Flash</span>
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
      <div className="dashboard-section-title" style={{ marginTop: "24px" }}>
        <h3>Connected Healthcare Infrastructure</h3>
        <span className="sub-meta">Real-time status of connected repositories and agents</span>
      </div>

      <div className="infrastructure-grid">
        <div className="infra-card">
          <div className="infra-header">
            <div className="infra-name">
              <span className="status-dot ok" />
              <strong>Medplum FHIR Server</strong>
            </div>
            <span className="chip ok sm">Port :8103</span>
          </div>
          <p className="infra-desc">Target clinical data repository storing reconciled Patient and Clinical FHIR resources.</p>
          <div className="infra-meta">
            <code>http://localhost:8103</code> • Version: FHIR R4
          </div>
        </div>

        <div className="infra-card">
          <div className="infra-header">
            <div className="infra-name">
              <span className="status-dot ok" />
              <strong>HAPI FHIR Server</strong>
            </div>
            <span className="chip ok sm">Port :8080</span>
          </div>
          <p className="infra-desc">Upstream EHR staging server providing legacy patient datasets and lab observations.</p>
          <div className="infra-meta">
            <code>http://localhost:8080/fhir</code> • Open API
          </div>
        </div>

        <div className="infra-card">
          <div className="infra-header">
            <div className="infra-name">
              <span className={`status-dot ${online ? "ok" : "bad"}`} />
              <strong>FastAPI ETL Core</strong>
            </div>
            <span className="chip brand sm">Port :8000</span>
          </div>
          <p className="infra-desc">High-throughput streaming ingestion pipeline with dynamic semantic transforms and SSE telemetry.</p>
          <div className="infra-meta">
            <code>http://localhost:8000</code> • Status: {online ? "Online" : "Offline"}
          </div>
        </div>

        <div className="infra-card">
          <div className="infra-header">
            <div className="infra-name">
              <span className="status-dot ok" style={{ background: "#c084fc", boxShadow: "0 0 8px #c084fc" }} />
              <strong>Gemini 2.5 Flash Agent</strong>
            </div>
            <span className="chip sm" style={{ background: "rgba(192, 132, 252, 0.2)", color: "#e9d5ff" }}>Active</span>
          </div>
          <p className="infra-desc">Autonomous self-healing reasoning core for closed-loop contract repair and zero-shot schema synthesis.</p>
          <div className="infra-meta">
            Model: <code>gemini-flash-lite-latest</code> • Avg Cost: $0.0003
          </div>
        </div>
      </div>
    </div>
  );
}

