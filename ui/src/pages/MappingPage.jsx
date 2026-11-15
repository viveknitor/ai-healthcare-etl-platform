import { useState } from "react";
import { api } from "../api.js";
import ReconciliationTable from "../components/ReconciliationTable.jsx";

const EXAMPLE = {
  member_id: "M1001",
  fname: "John",
  lname: "Smith",
  dob: "1990-01-15",
  sex: "M",
};

export default function MappingPage() {
  const [sampleText, setSampleText] = useState(JSON.stringify(EXAMPLE, null, 2));
  const [target, setTarget] = useState("Patient");
  const [mapping, setMapping] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [resultTab, setResultTab] = useState("table"); // "table" | "json"

  function parseSample() {
    try { return JSON.parse(sampleText); } catch { throw new Error("Sample is not valid JSON"); }
  }

  async function suggest() {
    setBusy("suggest"); setError(""); setPreview(null);
    try { setMapping(await api.suggestMapping(parseSample(), target)); }
    catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function test() {
    setBusy("test"); setError("");
    try { setPreview(await api.transform(mapping, parseSample())); }
    catch (e) { setError(e.message); setPreview(null); }
    finally { setBusy(""); }
  }

  function removeRule(i) {
    setMapping({ ...mapping, status: "pending_review", rules: mapping.rules.filter((_, j) => j !== i) });
    setPreview(null);
  }

  function editRule(i, field, value) {
    const rules = mapping.rules.map((r, j) => (j === i ? { ...r, [field]: value } : r));
    setMapping({ ...mapping, status: "pending_review", rules });
    setPreview(null);
  }

  const approved = mapping?.status === "approved";

  return (
    <section>
      <div className="grid2">
        <div className="card">
          <h2>1. Source sample</h2>
          <p className="muted">Paste one example record from the source system. Use synthetic data only.</p>
          <textarea rows={12} value={sampleText} onChange={(e) => setSampleText(e.target.value)} spellCheck={false} />
          <div className="row">
            <label>
              Target resource
              <input value={target} onChange={(e) => setTarget(e.target.value)} />
            </label>
            <button className="primary" onClick={suggest} disabled={busy === "suggest"}>
              {busy === "suggest" ? "Asking AI…" : "Suggest mapping"}
            </button>
          </div>
        </div>

        <div className="card">
          <h2>2. Review &amp; approve</h2>
          {!mapping && <p className="muted">AI suggestions appear here. Nothing runs until you approve.</p>}
          {mapping && (
            <>
              <div className="row between">
                <strong>{mapping.name} v{mapping.version}</strong>
                <span className={`chip ${approved ? "ok" : "warn"}`}>{mapping.status}</span>
              </div>
              <table>
                <thead>
                  <tr><th>Source</th><th>Target</th><th>Transform</th><th>Conf.</th><th /></tr>
                </thead>
                <tbody>
                  {mapping.rules.map((r, i) => (
                    <tr key={i} title={r.rationale || ""}>
                      <td><input value={r.source} onChange={(e) => editRule(i, "source", e.target.value)} /></td>
                      <td><input value={r.target} onChange={(e) => editRule(i, "target", e.target.value)} /></td>
                      <td>{r.transform}</td>
                      <td>
                        {r.confidence != null && (
                          <span className={`chip ${r.confidence >= 0.8 ? "ok" : "warn"}`}>
                            {Math.round(r.confidence * 100)}%
                          </span>
                        )}
                      </td>
                      <td><button className="link" onClick={() => removeRule(i)}>remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">Hover a row to see the AI's rationale. Any edit resets approval.</p>
              <div className="row">
                <button onClick={() => setMapping({ ...mapping, status: "approved" })} disabled={approved}>
                  {approved ? "Approved" : "Approve mapping"}
                </button>
                <button className="primary" onClick={test} disabled={!approved || busy === "test"}>
                  {busy === "test" ? "Testing…" : "Test on sample"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {preview && (
        <div className="card">
          <div className="row between" style={{ marginTop: 0, marginBottom: "10px" }}>
            <h2>3. Transformation &amp; Reconciliation Result</h2>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                className={`sm ${resultTab === "table" ? "primary" : "secondary"}`}
                onClick={() => setResultTab("table")}
              >
                🔄 Reconciliation Table
              </button>
              <button
                className={`sm ${resultTab === "json" ? "primary" : "secondary"}`}
                onClick={() => setResultTab("json")}
              >
                📄 Raw Target JSON
              </button>
            </div>
          </div>

          <div className="chips">
            <span className={`chip ${preview.mapping_errors.length ? "warn" : "ok"}`}>
              mapping errors {preview.mapping_errors.length}
            </span>
            <span className={`chip ${preview.validation_errors.length ? "bad" : "ok"}`}>
              FHIR validation {preview.validation_errors.length ? "failed" : "passed"}
            </span>
          </div>

          {[...preview.mapping_errors, ...preview.validation_errors].map((e, i) => (
            <p key={i} className="error small">{e}</p>
          ))}

          {resultTab === "table" ? (
            <div style={{ marginTop: "12px" }}>
              <ReconciliationTable
                table={preview.reconciliation_table}
                sourceTitle="Input Source Sample"
                targetTitle={`Target ${target} Payload`}
              />
            </div>
          ) : (
            <pre style={{ marginTop: "12px" }}>{JSON.stringify(preview.resource, null, 2)}</pre>
          )}
        </div>
      )}
    </section>
  );
}
