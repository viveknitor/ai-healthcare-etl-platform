import { useEffect, useState } from "react";
import { api } from "./api.js";
import PipelinePage from "./pages/PipelinePage.jsx";
import MappingPage from "./pages/MappingPage.jsx";
import UploadPage from "./pages/UploadPage.jsx";

const TABS = [
  { id: "pipeline", label: "HAPI to Medplum Sync", icon: "🔄" },
  { id: "upload", label: "Direct File Ingestion (QNEXT)", icon: "📁" },
  { id: "mapping", label: "AI Mapping Studio", icon: "✨" },
];

export default function App() {
  const [tab, setTab] = useState("pipeline");
  const [online, setOnline] = useState(null);

  useEffect(() => {
    api.health().then(() => setOnline(true)).catch(() => setOnline(false));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        {/* Brand Header */}
        <div className="brand-wrapper">
          <div className="brand-icon">⚡</div>
          <div className="brand-text">
            <h1>Healthcare ETL &amp; Interoperability Platform</h1>
            <span className="brand-tagline">Autonomous Multi-Agent Core • HL7 FHIR R4 • Idempotent Medplum Reconciler</span>
          </div>
        </div>

        {/* Glossy Capsule Navigation */}
        <nav className="nav-capsule">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        {/* Live System Status Badges */}
        <div className="system-status-pills">
          <div className="status-pill" title="Target FHIR R4 Destination">
            <span className="status-dot ok" />
            <span>Medplum :8103</span>
          </div>
          <div className="status-pill" title="Backend FastAPI status">
            <span className={`status-dot ${online === null ? "" : online ? "ok" : "bad"}`} />
            <span>{online === null ? "Connecting…" : online ? "FastAPI Core Ready" : "FastAPI Offline"}</span>
          </div>
          <div className="status-pill" title="AI Semantic Reasoning Engine">
            <span className="status-dot ok" style={{ background: "#a855f7", boxShadow: "0 0 8px #a855f7" }} />
            <span>Gemini 2.5 Flash</span>
          </div>
        </div>
      </header>

      <main>
        {tab === "pipeline" && <PipelinePage />}
        {tab === "upload" && <UploadPage />}
        {tab === "mapping" && <MappingPage />}
      </main>
    </div>
  );
}
