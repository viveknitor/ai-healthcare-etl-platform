import { useState } from "react";
import { api } from "../api.js";

const STATUS_CLASS = { delivered: "ok", dry_run: "info", invalid: "warn", failed: "bad" };

export default function PipelinePage() {
  const [count, setCount] = useState(10);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  async function run() {
    if (!dryRun && !window.confirm("This will write Patient resources to Medplum. Continue?")) return;
    setLoading(true); setError(""); setReport(null);
    try {
      setReport(await api.runPipeline(Number(count), dryRun));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <div className="card">
        <h2>HAPI FHIR → Medplum</h2>
        <p className="muted">Fetch Patients from the source, validate them, and deliver to Medplum.</p>
        <div className="row">
          <label>
            Records
            <input type="number" min="1" max="200" value={count} onChange={(e) => setCount(e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry run (validate only, write nothing)
          </label>
          <button className="primary" onClick={run} disabled={loading}>
            {loading ? "Running…" : dryRun ? "Run dry run" : "Run and deliver"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      {report && (
        <div className="card">
          <h2>Results</h2>
          <div className="chips">
            <span className="chip">Total {report.summary.total}</span>
            {Object.entries(report.summary.counts).map(([k, v]) => (
              <span key={k} className={`chip ${STATUS_CLASS[k] || ""}`}>{k} {v}</span>
            ))}
          </div>
          <table>
            <thead>
              <tr><th>Source ID</th><th>Status</th><th>Target ID</th><th>Errors</th></tr>
            </thead>
            <tbody>
              {report.results.map((r, i) => (
                <tr key={i}>
                  <td>{r.source_id}</td>
                  <td><span className={`chip ${STATUS_CLASS[r.status] || ""}`}>{r.status}</span></td>
                  <td>{r.target_id || "—"}</td>
                  <td className="errs">{r.errors.length ? r.errors.join("; ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
