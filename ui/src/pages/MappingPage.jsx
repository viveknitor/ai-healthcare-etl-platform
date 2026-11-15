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
    try {
      return JSON.parse(sampleText);
    } catch {
      throw new Error("Sample is not valid JSON");
    }
  }

  async function suggest() {
    setBusy("suggest");
    setError("");
    setPreview(null);
    try {
      setMapping(await api.suggestMapping(parseSample(), target));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function test() {
    setBusy("test");
    setError("");
    try {
      setPreview(await api.transform(mapping, parseSample()));
    } catch (e) {
      setError(e.message);
      setPreview(null);
    } finally {
      setBusy("");
    }
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
      {/* Overview Banner */}
      <div className="card" style={{ padding: "18px 24px", marginBottom: "20px" }}>
        <div className="row between" style={{ margin: 0 }}>
          <div>
            <h2>✨ AI Schema Mapping &amp; Synthesis Studio</h2>
            <p className="sub-meta" style={{ margin: "2px 0 0" }}>
              Autonomous Google Gemini 3.5 Flash agents inspect non-standard clinical JSON and synthesize validated FHIR R4 transformation schemas with human-in-the-loop review.
            </p>
          </div>
          <span className="chip ok" style={{ alignSelf: "center" }}>
            Model: Gemini 3.5 Flash
          </span>
        </div>
      </div>

      <div className="grid2">
        {/* Left: Source Sample Input */}
        <div className="card">
          <h2>1. Source Record Sample</h2>
          <p className="sub-meta">Paste one raw record from your legacy EHR or custom database feed.</p>
          <textarea
            rows={12}
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            spellCheck={false}
            style={{ marginTop: "8px" }}
          />

          <div className="row between" style={{ marginTop: "14px", alignItems: "flex-end" }}>
            <label style={{ minWidth: "160px" }}>
              Target Resource
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Patient, Observation, etc."
              />
            </label>

            <button
              className="primary"
              onClick={suggest}
              disabled={busy === "suggest"}
              style={{ minWidth: "160px" }}
            >
              {busy === "suggest" ? "🤖 AI Reasoning…" : "✨ Suggest Mapping"}
            </button>
          </div>
        </div>

        {/* Right: Review & Approval Gate */}
        <div className="card">
          <h2>2. Review &amp; Quality Gate</h2>
          {!mapping && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>🪄</div>
              <div>AI mapping suggestions will appear here.</div>
              <div className="sub-meta">Nothing runs against production until you explicitly approve the rules.</div>
            </div>
          )}

          {mapping && (
            <>
              <div className="row between" style={{ marginTop: 0, marginBottom: "8px" }}>
                <strong style={{ fontSize: "14px" }}>
                  {mapping.name} <span style={{ opacity: 0.6 }}>v{mapping.version}</span>
                </strong>
                <span className={`chip ${approved ? "ok" : "warn"}`}>
                  {approved ? "✓ Approved" : "Pending Review"}
                </span>
              </div>

              <table>
                <thead>
                  <tr>
                    <th style={{ width: "24%" }}>Source Field</th>
                    <th style={{ width: "32%" }}>Target FHIR Path</th>
                    <th style={{ width: "22%" }}>Transform</th>
                    <th style={{ width: "12%" }}>Conf.</th>
                    <th style={{ width: "10%", textAlign: "right" }} />
                  </tr>
                </thead>
                <tbody>
                  {mapping.rules.map((r, i) => (
                    <tr key={i} title={r.rationale || ""}>
                      <td>
                        <input
                          value={r.source}
                          onChange={(e) => editRule(i, "source", e.target.value)}
                          style={{ padding: "4px 8px", fontSize: "12px", width: "100%" }}
                        />
                      </td>
                      <td>
                        <input
                          value={r.target}
                          onChange={(e) => editRule(i, "target", e.target.value)}
                          style={{ padding: "4px 8px", fontSize: "12px", width: "100%" }}
                        />
                      </td>
                      <td>
                        <code style={{ fontSize: "11px", color: "var(--brand)" }}>{r.transform}</code>
                      </td>
                      <td>
                        {r.confidence != null && (
                          <span className={`chip ${r.confidence >= 0.8 ? "ok" : "warn"}`} style={{ fontSize: "11px", padding: "1px 6px" }}>
                            {Math.round(r.confidence * 100)}%
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button className="link" onClick={() => removeRule(i)} style={{ color: "var(--bad)" }}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="sub-meta" style={{ margin: "10px 0 14px" }}>
                Hover a row to view AI rationale. Manual edits safely revert approval status to <em>pending_review</em>.
              </p>

              <div className="row between" style={{ marginTop: 0 }}>
                <button
                  className={approved ? "secondary" : "primary"}
                  onClick={() => setMapping({ ...mapping, status: "approved" })}
                  disabled={approved}
                >
                  {approved ? "✓ Schema Approved" : "✓ Approve Mapping"}
                </button>

                <button
                  className="primary"
                  onClick={test}
                  disabled={!approved || busy === "test"}
                >
                  {busy === "test" ? "Transforming…" : "⚡ Test on Sample"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {error && <div className="error" style={{ margin: "14px 0" }}>{error}</div>}

      {/* 3. Dynamic Result & Reconciliation Matrix */}
      {preview && (
        <div className="card" style={{ marginTop: "20px" }}>
          <div className="row between" style={{ marginTop: 0, marginBottom: "12px" }}>
            <h2>3. Transformation &amp; Reconciliation Matrix</h2>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                className={`sm ${resultTab === "table" ? "primary" : "secondary"}`}
                onClick={() => setResultTab("table")}
              >
                🔄 Reconciliation Matrix
              </button>
              <button
                className={`sm ${resultTab === "json" ? "primary" : "secondary"}`}
                onClick={() => setResultTab("json")}
              >
                📄 Raw FHIR JSON
              </button>
            </div>
          </div>

          <div className="chips">
            <span className={`chip ${preview.mapping_errors.length ? "warn" : "ok"}`}>
              Mapping Errors: {preview.mapping_errors.length}
            </span>
            <span className={`chip ${preview.validation_errors.length ? "bad" : "ok"}`}>
              FHIR R4 Validation: {preview.validation_errors.length ? "Failed" : "Passed"}
            </span>
          </div>

          {[...preview.mapping_errors, ...preview.validation_errors].map((e, i) => (
            <p key={i} className="error small" style={{ margin: "4px 0" }}>
              {e}
            </p>
          ))}

          {resultTab === "table" ? (
            <div style={{ marginTop: "14px" }}>
              <ReconciliationTable
                table={preview.reconciliation_table}
                sourceTitle="Input Source Sample"
                targetTitle={`Target ${target} Payload`}
              />
            </div>
          ) : (
            <pre style={{ marginTop: "14px" }}>{JSON.stringify(preview.resource, null, 2)}</pre>
          )}
        </div>
      )}
    </section>
  );
}
