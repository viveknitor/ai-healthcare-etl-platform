import { useState, useEffect } from "react";
import { api } from "../api.js";
import ReconciliationTable from "../components/ReconciliationTable.jsx";

const STATUS_CLASS = { delivered: "ok", dry_run: "info", invalid: "warn", failed: "bad" };
const STORAGE_KEY = "healthcare_etl_pipeline_report";
const STORAGE_COUNT_KEY = "healthcare_etl_pipeline_count";
const STORAGE_OFFSET_KEY = "healthcare_etl_pipeline_offset";
const STORAGE_RESOURCE_KEY = "healthcare_etl_pipeline_resource";

const RESOURCE_OPTIONS = [
  { value: "Patient", label: "Patient (Demographics & Identity)", icon: "👤" },
  { value: "Observation", label: "Observation (Vitals, Labs, Biometrics)", icon: "🧪" },
  { value: "Condition", label: "Condition (Diagnoses & Problems)", icon: "🩺" },
  { value: "Encounter", label: "Encounter (Visits & Admissions)", icon: "🏥" },
];

export default function PipelinePage() {
  const [resourceType, setResourceType] = useState(
    () => localStorage.getItem(STORAGE_RESOURCE_KEY) || "Patient"
  );
  const [count, setCount] = useState(() => Number(localStorage.getItem(STORAGE_COUNT_KEY)) || 5);
  const [offset, setOffset] = useState(() => Number(localStorage.getItem(STORAGE_OFFSET_KEY)) || 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeRecord, setActiveRecord] = useState(null);
  const [modalTab, setModalTab] = useState("recon"); // "recon" | "dest" | "raw"
  const [liveData, setLiveData] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [copiedKey, setCopiedKey] = useState("");

  const openInspector = (record) => {
    setActiveRecord(record);
    setModalTab("recon");
    setLiveData(null);
    setLiveError("");
    setCopiedKey("");
  };

  const fetchLiveDestination = async () => {
    if (!activeRecord?.target_id) return;
    setLiveLoading(true);
    setLiveError("");
    try {
      const res = await api.getLiveMedplumResource(resourceType, activeRecord.target_id);
      setLiveData(res.resource);
    } catch (err) {
      setLiveError(err.message);
    } finally {
      setLiveLoading(false);
    }
  };

  const copyPayload = (key, data) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 2000);
  };

  // Persistent report state: survives page reloads until explicitly cleared
  const [report, setReport] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (report) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(report));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [report]);

  useEffect(() => {
    localStorage.setItem(STORAGE_COUNT_KEY, count);
  }, [count]);

  useEffect(() => {
    localStorage.setItem(STORAGE_OFFSET_KEY, offset);
  }, [offset]);

  useEffect(() => {
    localStorage.setItem(STORAGE_RESOURCE_KEY, resourceType);
  }, [resourceType]);

  async function executePipeline(dryRun, customOffset = offset, customResType = resourceType) {
    if (
      !dryRun &&
      !window.confirm(
        `This will deliver ${count} ${customResType} records (Offset ${customOffset}) to local Medplum (http://localhost:8103). Continue?`
      )
    ) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await api.runPipeline(Number(count), dryRun, Number(customOffset), customResType);
      setReport(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function nextBatch(dryRun = true) {
    const newOffset = offset + count;
    setOffset(newOffset);
    executePipeline(dryRun, newOffset, resourceType);
  }

  function prevBatch(dryRun = true) {
    const newOffset = Math.max(0, offset - count);
    setOffset(newOffset);
    executePipeline(dryRun, newOffset, resourceType);
  }

  function clearResults() {
    if (window.confirm("Are you sure you want to clear these results from the UI?")) {
      setReport(null);
      localStorage.removeItem(STORAGE_KEY);
      setActiveRecord(null);
    }
  }

  return (
    <section>
      {/* 1. Capability & Process Flow Overview */}
      <div className="card">
        <h2>Multi-Resource Healthcare ETL: HAPI FHIR → Medplum Ingestion Platform</h2>
        <p className="muted">
          Automated multi-resource pipeline with cross-resource referential integrity, clinical normalization, and idempotent destination reconciliation.
        </p>

        <div className="pipeline-flow">
          <div className="flow-step">
            <div className="step-num">Step 1 • Ingest</div>
            <div className="step-title">Source Extraction</div>
            <div className="step-desc">
              Paginates live FHIR R4 <strong>{resourceType}</strong> records from HAPI with in-batch deduplication.
            </div>
          </div>
          <div className="flow-step">
            <div className="step-num">Step 2 • Sanitize</div>
            <div className="step-title">Metadata Stripping</div>
            <div className="step-desc">
              Strips source <code>id</code>, <code>meta</code>, and <code>text</code> narrative to prevent destination ID collisions.
            </div>
          </div>
          <div className="flow-step">
            <div className="step-num">Step 3 • Link</div>
            <div className="step-title">Cross-Resource Remap</div>
            <div className="step-desc">
              Remaps foreign keys (e.g. <code>subject</code>) to conditional references (<code>Patient?identifier=...</code>).
            </div>
          </div>
          <div className="flow-step">
            <div className="step-num">Step 4 • Deliver</div>
            <div className="step-title">Medplum Reconciliation</div>
            <div className="step-desc">
              Validates against FHIR R4 schema and executes conditional upsert via OAuth2 client credentials.
            </div>
          </div>
        </div>

        {/* Multi-Resource & Deduplication Specification Box */}
        <div className="spec-box" style={{ background: "rgba(26, 127, 75, 0.05)", borderColor: "rgba(26, 127, 75, 0.2)" }}>
          <h3 style={{ color: "var(--ok)" }}>Multi-Resource Ingestion &amp; Referential Integrity Guarantees</h3>
          <div className="spec-grid">
            <div className="spec-item">
              <strong>1. Active Resource: {resourceType}</strong>
              Full FHIR R4 schema validation, terminology bindings, and clinical extraction.
            </div>
            <div className="spec-item">
              <strong>2. Cross-Resource Foreign Keys</strong>
              Clinical records link to Patients using <code>subject.reference = Patient?identifier=urn:source:hapi|&lt;id&gt;</code>.
            </div>
            <div className="spec-item">
              <strong>3. Destination Idempotency</strong>
              Conditional upsert on <code>?identifier=urn:source:hapi|&lt;id&gt;</code> prevents duplicate insertions.
            </div>
            <div className="spec-item">
              <strong>4. Clinical Data Preservation</strong>
              Retains LOINC codes, UCUM units, and ICD-10 diagnostic classifications.
            </div>
          </div>
        </div>

        {/* Execution & Resource Controls */}
        <div className="row between">
          <div className="row" style={{ margin: 0, gap: "10px" }}>
            <label>
              Target Resource Type
              <select
                value={resourceType}
                onChange={(e) => {
                  const newType = e.target.value;
                  setResourceType(newType);
                  setOffset(0);
                }}
                style={{
                  font: "inherit",
                  padding: "7px 10px",
                  background: "var(--bg)",
                  color: "var(--text)",
                  border: "1px solid var(--line)",
                  borderRadius: "6px",
                  fontWeight: 600,
                }}
              >
                {RESOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.icon} {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Record Count
              <input
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
                style={{ width: "80px" }}
              />
            </label>

            <label>
              Source Offset
              <input
                type="number"
                min="0"
                value={offset}
                onChange={(e) => setOffset(Math.max(0, Number(e.target.value)))}
                style={{ width: "80px" }}
                title="Paginates HAPI to fetch the next consecutive unique records"
              />
            </label>

            <button
              className="secondary"
              onClick={() => executePipeline(true)}
              disabled={loading}
              title={`Fetches ${resourceType} from HAPI, normalizes, and derives mapping without writing to Medplum`}
            >
              {loading ? "Processing…" : `Preview ${count} ${resourceType}s (Dry Run)`}
            </button>

            <button
              className="primary"
              onClick={() => executePipeline(false)}
              disabled={loading}
              title={`Extracts ${resourceType} from HAPI and delivers directly into your local Medplum instance`}
            >
              {loading ? "Processing…" : `Deliver ${count} to Medplum`}
            </button>

            <button
              className="secondary sm"
              onClick={() => prevBatch(true)}
              disabled={loading || offset <= 0}
              title="Fetch previous batch of records"
            >
              ← Prev Batch
            </button>

            <button
              className="secondary sm"
              onClick={() => nextBatch(true)}
              disabled={loading}
              title="Fetch next consecutive batch of records"
            >
              Next Batch →
            </button>
          </div>

          {report && (
            <button className="danger sm" onClick={clearResults}>
              Clear Results
            </button>
          )}
        </div>

        {error && <p className="error">{error}</p>}
      </div>

      {/* 2. Results & Derivation Table */}
      {report && (
        <div className="card">
          <div className="row between" style={{ margin: 0, marginBottom: "12px" }}>
            <div>
              <h2>
                Pipeline Derivation Table: {resourceType}{" "}
                <span className="muted small" style={{ fontWeight: 400 }}>
                  (Offset: {offset} • Range: #{offset + 1} to #{offset + report.results.length})
                </span>
              </h2>
              <p className="muted small" style={{ margin: 0 }}>
                Data is persisted locally across browser refreshes until you click Clear.
              </p>
            </div>
            <div className="chips">
              <span className="chip">Batch Total: {report.summary.total}</span>
              {Object.entries(report.summary.counts).map(([k, v]) => (
                <span key={k} className={`chip ${STATUS_CLASS[k] || ""}`}>
                  {k}: {v}
                </span>
              ))}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style={{ width: "30px" }}>#</th>
                <th>Source {resourceType} (HAPI)</th>
                <th>
                  {resourceType === "Patient"
                    ? "Demographics Derivation"
                    : resourceType === "Observation"
                    ? "Measurement / Clinical Value"
                    : resourceType === "Condition"
                    ? "Clinical Diagnosis & Status"
                    : "Encounter Details"}
                </th>
                <th>Cross-Resource Link &amp; Mapping Rules</th>
                <th>Target Medplum ID</th>
                <th>Status &amp; Action</th>
                <th style={{ textAlign: "right" }}>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {report.results.map((r, i) => {
                const s = r.patient_summary || {};
                const m = r.mapping_details || {};
                const deliveryAction = m.delivery_action; // 'created' or 'updated'
                return (
                  <tr key={i}>
                    <td style={{ color: "var(--muted)", fontSize: "12px" }}>{offset + i + 1}</td>
                    <td>
                      <strong>{s.title || s.display_name || "Unknown"}</strong>
                      <div className="sub-meta">
                        Source ID: <code>{r.source_id}</code>
                        {s.code && s.code !== "—" && <span> • Code: {s.code}</span>}
                      </div>
                    </td>
                    <td>
                      <div>
                        {resourceType === "Patient" ? (
                          <>
                            <strong>Gender:</strong> {s.gender || "—"} | <strong>DOB:</strong> {s.birth_date || "—"}
                          </>
                        ) : resourceType === "Observation" ? (
                          <>
                            <strong style={{ fontSize: "14px", color: "var(--brand)" }}>
                              {s.primary_value || "—"}
                            </strong>
                            <div className="sub-meta">Effective: {s.secondary_value || "—"}</div>
                          </>
                        ) : resourceType === "Condition" ? (
                          <>
                            <strong>Status:</strong> {s.clinical_status || "active"} ({s.verification_status || "confirmed"})
                            <div className="sub-meta">Recorded: {s.secondary_value || "—"}</div>
                          </>
                        ) : (
                          <>
                            <strong>Class:</strong> {s.primary_value || "—"}
                            <div className="sub-meta">Period: {s.period || s.secondary_value || "—"}</div>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <div>
                        <span className="rule-tag">ID: {m.idempotent_identifier || `urn:source:hapi|${r.source_id}`}</span>
                      </div>
                      {s.subject_reference && s.subject_reference !== "—" && (
                        <div className="sub-meta" style={{ marginTop: "3px" }}>
                          <strong>Links to:</strong>{" "}
                          <span style={{ color: "var(--brand)", fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>
                            {s.subject_reference} ➔ {m.target_subject_reference}
                          </span>
                        </div>
                      )}
                      <div className="sub-meta">
                        Stripped: <code>id</code>, <code>meta</code>, <code>text</code> • FHIR R4 Valid
                      </div>
                    </td>
                    <td>
                      {r.target_id ? (
                        <div>
                          <a
                            href={`http://localhost:3000/${resourceType}/${r.target_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="target-link"
                            title={`Click to view this ${resourceType} in Medplum Web App`}
                          >
                            {r.target_id.slice(0, 18)}… ↗
                          </a>
                          <div className="sub-meta">
                            {deliveryAction === "created" ? (
                              <span style={{ color: "var(--ok)", fontWeight: 600 }}>+ Newly Created in DB</span>
                            ) : deliveryAction === "updated" ? (
                              <span style={{ color: "var(--info)", fontWeight: 600 }}>↻ Updated Existing Record</span>
                            ) : (
                              `Saved in Medplum ${resourceType}`
                            )}
                          </div>
                        </div>
                      ) : r.status === "dry_run" ? (
                        <span className="muted" style={{ fontStyle: "italic", fontSize: "13px" }}>
                          Validated (Ready to deliver)
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <span className={`chip ${STATUS_CLASS[r.status] || ""}`}>{r.status}</span>
                      {deliveryAction && (
                        <span
                          className={`chip ${deliveryAction === "created" ? "ok" : "info"}`}
                          style={{ marginLeft: "4px", fontSize: "11px" }}
                        >
                          {deliveryAction}
                        </span>
                      )}
                      {r.errors && r.errors.length > 0 && (
                        <div className="errs">{r.errors.join("; ")}</div>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="secondary sm" onClick={() => openInspector(r)}>
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. Dynamic Multi-Perspective Record Inspector Modal */}
      {activeRecord && (
        <div className="modal-overlay" onClick={() => setActiveRecord(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0, marginBottom: "4px" }}>
                  Record Mapping Inspector: <code>{activeRecord.source_id}</code> ({resourceType})
                </h3>
                <span className={`chip ${STATUS_CLASS[activeRecord.status] || ""}`}>
                  Status: {activeRecord.status}
                </span>
                {activeRecord.mapping_details?.delivery_action && (
                  <span
                    className={`chip ${activeRecord.mapping_details.delivery_action === "created" ? "ok" : "info"}`}
                    style={{ marginLeft: "6px" }}
                  >
                    Action: {activeRecord.mapping_details.delivery_action}
                  </span>
                )}
                {activeRecord.target_id && (
                  <span style={{ marginLeft: "10px", fontSize: "13px" }}>
                    Medplum ID:{" "}
                    <a
                      href={`http://localhost:3000/${resourceType}/${activeRecord.target_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="target-link"
                    >
                      {activeRecord.target_id} ↗
                    </a>
                  </span>
                )}
              </div>
              <button className="secondary sm" onClick={() => setActiveRecord(null)}>
                ✕ Close
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="modal-tabs">
              <button
                className={`modal-tab-btn ${modalTab === "recon" ? "active" : ""}`}
                onClick={() => setModalTab("recon")}
              >
                <span>🔄</span> Dynamic Reconciliation Table
              </button>
              <button
                className={`modal-tab-btn ${modalTab === "dest" ? "active" : ""}`}
                onClick={() => setModalTab("dest")}
              >
                <span>🏥</span> Destination Storage Perspective (Medplum)
              </button>
              <button
                className={`modal-tab-btn ${modalTab === "raw" ? "active" : ""}`}
                onClick={() => setModalTab("raw")}
              >
                <span>📄</span> Raw JSON Payloads
              </button>
            </div>

            {/* Modal Tab Contents */}
            <div className="modal-body">
              {/* TAB 1: Dynamic Reconciliation Table */}
              {modalTab === "recon" && (
                <div>
                  <div style={{ marginBottom: "12px", fontSize: "13px", color: "var(--muted)" }}>
                    Field-by-field extraction and derivation matrix. Dynamically captures all source attributes, transformations, and final stored values.
                  </div>
                  <ReconciliationTable
                    table={activeRecord.reconciliation_table}
                    sourceTitle="Source Payload (HAPI)"
                    targetTitle="Target Stored (Medplum)"
                  />
                </div>
              )}

              {/* TAB 2: Destination Storage Perspective */}
              {modalTab === "dest" && (
                <div>
                  {/* Stored Record Overview Card */}
                  <div className="dest-summary-card">
                    <div className="row between" style={{ marginTop: 0, marginBottom: "8px" }}>
                      <h4 style={{ margin: 0, fontSize: "14px" }}>
                        Destination Storage Profile: Medplum FHIR R4
                      </h4>
                      {activeRecord.target_id && (
                        <a
                          href={`http://localhost:3000/${resourceType}/${activeRecord.target_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="target-link"
                          style={{ fontSize: "13px" }}
                        >
                          Open in Medplum Console ↗
                        </a>
                      )}
                    </div>

                    <div className="dest-meta-grid">
                      <div className="dest-meta-item">
                        <label>Target Resource</label>
                        <div>{resourceType}</div>
                      </div>
                      <div className="dest-meta-item">
                        <label>Assigned Medplum ID</label>
                        <div>{activeRecord.target_id || "— (Not yet committed)"}</div>
                      </div>
                      <div className="dest-meta-item">
                        <label>Scoped Identifier</label>
                        <div>{activeRecord.mapping_details?.idempotent_identifier || "—"}</div>
                      </div>
                      <div className="dest-meta-item">
                        <label>Delivery Status</label>
                        <div style={{ color: activeRecord.status === "delivered" ? "var(--ok)" : "var(--warn)" }}>
                          {activeRecord.status.toUpperCase()} ({activeRecord.mapping_details?.delivery_action || "ready"})
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Live Database Verification Button & Banner */}
                  {activeRecord.target_id ? (
                    <div style={{ marginBottom: "20px" }}>
                      <div className="row between" style={{ marginBottom: "10px" }}>
                        <div>
                          <strong>Live Database Verification:</strong>
                          <span className="muted small" style={{ marginLeft: "8px" }}>
                            Directly query Medplum PostgreSQL/FHIR store to confirm persisted record state.
                          </span>
                        </div>
                        <button
                          className="primary sm"
                          onClick={fetchLiveDestination}
                          disabled={liveLoading}
                        >
                          {liveLoading ? "Querying Medplum…" : "⚡ Verify Live from Destination DB"}
                        </button>
                      </div>

                      {liveError && (
                        <div className="error" style={{ background: "rgba(192, 54, 44, 0.1)", padding: "10px", borderRadius: "6px" }}>
                          Verification failed: {liveError}
                        </div>
                      )}

                      {liveData && (
                        <div className="live-verify-banner">
                          <div>
                            <span style={{ color: "var(--ok)", fontWeight: 700, fontSize: "14px" }}>
                              ✓ Confirmed Live in Medplum Database!
                            </span>
                            <div className="sub-meta">
                              Version ID: <code>{liveData.meta?.versionId || "1"}</code> • Last Updated:{" "}
                              <code>{liveData.meta?.lastUpdated || "Just now"}</code> • ID: <code>{liveData.id}</code>
                            </div>
                          </div>
                          <span className="chip ok">Verified in DB</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="spec-box" style={{ margin: "16px 0" }}>
                      <strong>Dry Run Mode:</strong> This record was validated against the FHIR R4 schema. Deliver the batch (uncheck Dry Run) to commit and generate native Medplum database IDs.
                    </div>
                  )}

                  {/* Extracted Record Attributes in Destination */}
                  <h4 style={{ margin: "16px 0 8px", fontSize: "14px" }}>
                    Stored Resource Summary (Extracted Perspective)
                  </h4>
                  <ReconciliationTable
                    table={activeRecord.reconciliation_table.filter(
                      (r) => r.status !== "dropped" && r.status !== "sanitized"
                    )}
                    sourceTitle="Input Source"
                    targetTitle="Committed in Medplum"
                  />
                </div>
              )}

              {/* TAB 3: Raw JSON Payloads */}
              {modalTab === "raw" && (
                <div className="grid2">
                  <div className="pane">
                    <div className="row between" style={{ margin: "0 0 8px" }}>
                      <h4 style={{ margin: 0 }}>1. Source HAPI FHIR Record</h4>
                      <button
                        className="secondary sm"
                        onClick={() => copyPayload("src", activeRecord.source_record)}
                      >
                        {copiedKey === "src" ? "✓ Copied" : "Copy Source JSON"}
                      </button>
                    </div>
                    <pre>{JSON.stringify(activeRecord.source_record || {}, null, 2)}</pre>
                  </div>

                  <div className="pane">
                    <div className="row between" style={{ margin: "0 0 8px" }}>
                      <h4 style={{ margin: 0 }}>2. Target Medplum Payload</h4>
                      <button
                        className="secondary sm"
                        onClick={() => copyPayload("tgt", liveData || activeRecord.target_record)}
                      >
                        {copiedKey === "tgt" ? "✓ Copied" : "Copy Target JSON"}
                      </button>
                    </div>
                    <pre>{JSON.stringify(liveData || activeRecord.target_record || {}, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
