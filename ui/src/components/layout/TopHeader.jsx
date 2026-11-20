import React from "react";

export default function TopHeader({ activeTab, online, currentDataset, recordCounts }) {
  const titles = {
    overview: "Executive Operations Dashboard",
    upload: "Direct File Ingestion Hub",
    pipeline: "FHIR Server-to-Server Live Sync",
    mapping: "Autonomous AI Mapping Studio",
  };

  return (
    <header className="app-top-header">
      {/* Left: Breadcrumbs & View Title */}
      <div className="top-header-left">
        <div className="breadcrumb-path">
          <span>Enterprise ETL Platform</span>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-active">{titles[activeTab] || "Dashboard"}</span>
        </div>
        <h2 className="top-header-title">{titles[activeTab] || "Operations"}</h2>
      </div>

      {/* Right: Live Telemetry & Connectivity Badges */}
      <div className="top-header-right">
        {currentDataset && (
          <div className="header-batch-pill" title="Currently Active Ingestion Batch">
            <span style={{ opacity: 0.7 }}>Active Batch:</span>
            <strong>{currentDataset}</strong>
            {recordCounts !== undefined && (
              <span className="chip brand sm">{recordCounts} rows</span>
            )}
          </div>
        )}

        {/* Connectivity Badges */}
        <div className="status-pill" title="Backend Core Service">
          <span className={`status-dot ${online === null ? "" : online ? "ok" : "bad"}`} />
          <span>{online === null ? "Connecting…" : online ? "FastAPI Core :8000" : "FastAPI Offline"}</span>
        </div>

        <div className="status-pill" title="Target FHIR R4 Repository">
          <span className="status-dot ok" />
          <span>Medplum :8103</span>
        </div>

        <div className="environment-pill" title="Active Environment">
          <span className="env-dot" />
          <span>LOCAL DEV</span>
        </div>
      </div>
    </header>
  );
}
