import { useEffect, useState } from "react";
import { api } from "./api.js";
import PipelinePage from "./pages/PipelinePage.jsx";
import MappingPage from "./pages/MappingPage.jsx";

const TABS = [
  { id: "pipeline", label: "Pipeline" },
  { id: "mapping", label: "Mapping studio" },
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
        <h1>Healthcare ETL</h1>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <span className={`dot ${online === null ? "" : online ? "ok" : "bad"}`}>
          {online === null ? "checking…" : online ? "API online" : "API offline"}
        </span>
      </header>
      <main>{tab === "pipeline" ? <PipelinePage /> : <MappingPage />}</main>
    </div>
  );
}
