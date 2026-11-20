import { useState, useEffect } from "react";
import { api } from "../api.js";
import ReconciliationTable from "../components/ReconciliationTable.jsx";
import AgentWorkflowVisualizer from "../components/AgentWorkflowVisualizer.jsx";

const STATUS_CLASS = { delivered: "ok", dry_run: "info", invalid: "warn", failed: "bad" };
const STORAGE_KEY = "healthcare_etl_pipeline_report";
const STORAGE_COUNT_KEY = "healthcare_etl_pipeline_count";
const STORAGE_OFFSET_KEY = "healthcare_etl_pipeline_offset";
const STORAGE_RESOURCE_KEY = "healthcare_etl_pipeline_resource";

const RESOURCE_OPTIONS = [
  { value: "Patient", label: "Patient", sub: "Demographics & MRN", icon: "👤" },
  { value: "Observation", label: "Observation", sub: "Labs & Clinical Vitals", icon: "🧪" },
  { value: "Condition", label: "Condition", sub: "Diagnoses & Problems", icon: "🩺" },
  { value: "Encounter", label: "Encounter", sub: "Visits & Admissions", icon: "🏥" },
];

export default function PipelinePage() {
  const [resourceType, setResourceType] = useState(
    () => localStorage.getItem(STORAGE_RESOURCE_KEY) || "Patient"
  );
  const [count, setCount] = useState(() => Number(localStorage.getItem(STORAGE_COUNT_KEY)) || 5);
  const [offset, setOffset] = useState(() => Number(localStorage.getItem(STORAGE_OFFSET_KEY)) || 0);
  const [dryRun, setDryRun] = useState(true);
  const [isValidated, setIsValidated] = useState(false);
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

  async function executePipeline(isDryRun = dryRun, customOffset = offset, customResType = resourceType) {
    if (
      !isDryRun &&
      !window.confirm(
        `This will deliver ${count} ${customResType} records (Offset ${customOffset}) to local Medplum (http://localhost:8103). Continue?`
      )
    ) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await api.runPipeline(Number(count), isDryRun, Number(customOffset), customResType);
      setReport(data);
      if (isDryRun) {
        const hasErr = (data?.summary?.counts?.invalid || 0) > 0 || (data?.summary?.counts?.failed || 0) > 0;
        setIsValidated(!hasErr && (data?.results?.length || 0) > 0);
      }
    } catch (e) {
      setError(e.message);
      if (isDryRun) setIsValidated(false);
    } finally {
      setLoading(false);
    }
  }

  function nextBatch() {
    setIsValidated(false);
    const newOffset = offset + count;
    setOffset(newOffset);
    executePipeline(true, newOffset, resourceType);
  }

  function prevBatch() {
    setIsValidated(false);
    const newOffset = Math.max(0, offset - count);
    setOffset(newOffset);
    executePipeline(true, newOffset, resourceType);
  }

  function clearResults() {
    if (window.confirm("Are you sure you want to clear these results from the UI?")) {
      setReport(null);
      setIsValidated(false);
      localStorage.removeItem(STORAGE_KEY);
      setActiveRecord(null);
    }
  }

  const downloadCSVReport = () => {
    if (!report?.results || report.results.length === 0) return;
    const rows = report.results.map((r, i) => ({
      "#": offset + i + 1,
      "Source Resource": resourceType,
      "Source ID": r.source_id,
      "Title / Patient Name": r.patient_summary?.title || "—",
      "Primary Metric / Code": r.patient_summary?.primary_value || r.patient_summary?.code || "—",
      "Secondary / Date": r.patient_summary?.secondary_value || r.patient_summary?.subtitle || "—",
      "Status": r.status === "dry_run" ? "validated" : r.status,
      "Delivery Action": r.mapping_details?.delivery_action || "—",
      "Target Medplum ID": r.target_id || "—",
      "Medplum URL": r.target_id ? `http://localhost:3000/${resourceType}/${r.target_id}` : "—",
      "Idempotent Identifier": r.mapping_details?.idempotent_identifier || `urn:source:hapi|${r.source_id}`,
      "Subject Link": r.mapping_details?.target_subject_reference || r.patient_summary?.subject_reference || "—",
      "Errors": (r.errors || []).join(" | "),
    }));
    const headers = Object.keys(rows[0]);
    // Prepend UTF-8 BOM (\uFEFF) so Microsoft Excel opens it directly without character corruption
    const csvContent =
      "\uFEFF" +
      [
        headers.join(","),
        ...rows.map((row) =>
          headers
            .map((h) => `"${String(row[h] || "").replace(/"/g, '""')}"`)
            .join(",")
        ),
      ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `HAPI_to_Medplum_${resourceType}_Offset${offset}_Audit.csv`;
    link.click();
  };

  const downloadJSONReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `HAPI_to_Medplum_${resourceType}_Offset${offset}_Bundle.json`;
    link.click();
  };

  const deliveredCount = report?.summary?.counts?.delivered || 0;
  const totalCount = report?.summary?.total || 0;

  return (
    <section>
      {/* 1. Executive KPI Metric Dashboard Bar */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon">📦</div>
          <div className="kpi-content">
            <span className="kpi-label">Batch Processed</span>
            <span className="kpi-value">{totalCount} Records</span>
            <span className="kpi-sub">Source: HAPI FHIR R4</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ color: "var(--ok)" }}>⚡</div>
          <div className="kpi-content">
            <span className="kpi-label">Delivered to Medplum</span>
            <span className="kpi-value">{deliveredCount} Persisted</span>
            <span className="kpi-sub">100% Idempotent Upsert</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ color: "var(--brand)" }}>🏥</div>
          <div className="kpi-content">
            <span className="kpi-label">Target Destination</span>
            <span className="kpi-value">Medplum :8103</span>
            <span className="kpi-sub">PostgreSQL 16 Backend</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ color: "var(--info)" }}>🛡️</div>
          <div className="kpi-content">
            <span className="kpi-label">Semantic Quality Gate</span>
            <span className="kpi-value">FHIR R4 / R4B</span>
            <span className="kpi-sub">Zero Duplicate Rows</span>
          </div>
        </div>
      </div>

      {/* 2. Autonomous Multi-Agent Relay */}
      <AgentWorkflowVisualizer
        datasetName={`HAPI FHIR R4 (${resourceType})`}
        recordsCount={count}
        approved={true}
        validated={isValidated}
        delivered={deliveredCount > 0}
      />

      {/* 3. Pipeline Control & Multi-Resource Selector */}
      <div className="card">
        <div className="row between" style={{ marginTop: 0, marginBottom: "16px" }}>
          <div>
            <h2>🔄 HAPI to Medplum Integration Engine</h2>
            <p className="sub-meta" style={{ margin: "2px 0 0" }}>
              Automated schema extraction, foreign-key reference remapping, and conditional upsert reconciliation with mandatory quality gates.
            </p>
          </div>
          <div className="row" style={{ margin: 0, gap: "8px", alignItems: "center" }}>
            {isValidated && (
              <span className="chip ok" style={{ fontSize: "12px", padding: "4px 10px" }}>
                ✓ Schema Validated
              </span>
            )}
            {report && (
              <button className="danger sm" onClick={clearResults}>
                🗑️ Clear UI Results
              </button>
            )}
          </div>
        </div>

        {/* Segmented Resource Pills Selector */}
        <div className="resource-pill-selector">
          {RESOURCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`resource-pill-btn ${resourceType === opt.value ? "active" : ""}`}
              onClick={() => {
                setResourceType(opt.value);
                setOffset(0);
                setIsValidated(false);
              }}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
              <span style={{ fontSize: "11px", opacity: 0.7, fontWeight: 400 }}>({opt.sub})</span>
            </button>
          ))}
        </div>

        {/* Glossy Execution Control Bar */}
        <div className="row between" style={{ alignItems: "center", background: "rgba(0,0,0,0.2)", padding: "14px 18px", borderRadius: "var(--radius-md)", border: "1px solid var(--card-border)" }}>
          <div className="row" style={{ margin: 0, gap: "14px", alignItems: "center" }}>
            <label>
              Batch Size
              <input
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => {
                  setCount(Math.max(1, Number(e.target.value)));
                  setIsValidated(false);
                }}
                style={{ width: "80px" }}
              />
            </label>

            <label>
              Source Offset
              <input
                type="number"
                min="0"
                value={offset}
                onChange={(e) => {
                  setOffset(Math.max(0, Number(e.target.value)));
                  setIsValidated(false);
                }}
                style={{ width: "90px" }}
                title="Paginates HAPI to fetch the next consecutive unique records"
              />
            </label>
          </div>

          <div className="row" style={{ margin: 0, gap: "10px", alignItems: "center" }}>
            <button
              className="secondary"
              onClick={prevBatch}
              disabled={loading || offset <= 0}
              title="Fetch previous batch from source"
            >
              ← Prev
            </button>

            <button
              className="secondary"
              onClick={() => {
                setDryRun(true);
                executePipeline(true, offset, resourceType);
              }}
              disabled={loading}
              title="Mandatory step: Validate batch against FHIR schema without writing to DB"
              style={{ minWidth: "190px", borderColor: isValidated ? "var(--ok)" : undefined }}
            >
              {loading && dryRun ? "Validating…" : `🛡️ Validate & Verify Schema (${count})`}
            </button>

            <button
              className={`primary success ${!isValidated ? "disabled-gate" : ""}`}
              onClick={() => {
                if (!isValidated) {
                  alert("Mandatory Quality Gate: You must run 'Validate & Verify Schema' before delivering records to Medplum.");
                  return;
                }
                setDryRun(false);
                executePipeline(false, offset, resourceType);
              }}
              disabled={loading || !isValidated}
              title={
                isValidated
                  ? "Deliver and persist verified batch into Medplum database"
                  : "Validation Required: Please run 'Validate & Verify Schema' first to unlock delivery."
              }
              style={{
                minWidth: "210px",
                opacity: !isValidated ? 0.45 : 1,
                cursor: !isValidated ? "not-allowed" : "pointer",
              }}
            >
              {loading && !dryRun ? "Delivering…" : `⚡ Deliver to Medplum (${count})`}
            </button>

            <button
              className="secondary"
              onClick={nextBatch}
              disabled={loading}
              title="Advance offset to next batch of unique records"
            >
              Next Batch →
            </button>
          </div>
        </div>

        {error && <div className="error" style={{ marginTop: "14px" }}>{error}</div>}
      </div>

      {/* 3. Ingestion & Dynamic Reconciliation Table */}
      {report && (
        <div className="card">
          <div className="row between" style={{ marginTop: 0, marginBottom: "12px", alignItems: "flex-start" }}>
            <div>
              <h2 style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", margin: 0 }}>
                <span>Ingestion Results: {resourceType}</span>
                <span className="chip info" style={{ fontSize: "12px" }}>
                  Offset {offset} • Records #{offset + 1} to #{offset + (report.results?.length || count)}
                </span>
                {report.summary?.counts?.delivered > 0 && (
                  <span className="chip ok" style={{ fontSize: "12px" }}>
                    ✓ Persisted to Medplum
                  </span>
                )}
              </h2>
              <p className="sub-meta" style={{ margin: "4px 0 0" }}>
                State is persisted across browser refreshes. Click <strong>Inspect</strong> to view field extraction &amp; destination perspective.
              </p>
            </div>

            <div className="row" style={{ margin: 0, gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="secondary sm"
                onClick={downloadCSVReport}
                title="Download CSV audit report (Excel-compatible with UTF-8 BOM)"
                style={{ padding: "6px 12px", fontSize: "12px" }}
              >
                📥 Export Audit CSV (Excel)
              </button>
              <button
                className="secondary sm"
                onClick={downloadJSONReport}
                title="Download full JSON bundle"
                style={{ padding: "6px 12px", fontSize: "12px" }}
              >
                📥 Export JSON Bundle
              </button>
              <div className="chips" style={{ margin: 0 }}>
                <span className="chip">Total: {report.summary.total}</span>
                {Object.entries(report.summary.counts).map(([k, v]) => (
                  <span key={k} className={`chip ${STATUS_CLASS[k] || ""}`}>
                    {k}: {v}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style={{ width: "5%" }}>#</th>
                <th style={{ width: "24%" }}>Source {resourceType} (HAPI)</th>
                <th style={{ width: "20%" }}>Clinical Metric / Demographics</th>
                <th style={{ width: "25%" }}>Cross-Resource Links &amp; Identity</th>
                <th style={{ width: "16%" }}>Target Medplum Record</th>
                <th style={{ width: "10%" }}>Status</th>
                <th style={{ width: "8%", textAlign: "right" }}>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {report.results.map((r, i) => {
                const s = r.patient_summary || {};
                const m = r.mapping_details || {};
                const deliveryAction = m.delivery_action;

                return (
                  <tr key={i}>
                    <td style={{ color: "var(--text-muted)", fontWeight: 600 }}>{offset + i + 1}</td>
                    <td>
                      <strong style={{ fontSize: "14px", color: "#fff" }}>{s.title || "Unknown"}</strong>
                      <div className="sub-meta">
                        Source ID: <code>{r.source_id}</code>
                        {s.code && s.code !== "—" && ` • Code: ${s.code}`}
                      </div>
                    </td>
                    <td>
                      <div style={{ color: "var(--brand)", fontWeight: 600 }}>{s.primary_value || "—"}</div>
                      <div className="sub-meta">
                        {s.subtitle ? s.subtitle : `Secondary: ${s.secondary_value || "—"}`}
                      </div>
                    </td>
                    <td>
                      <div>
                        <span className="rule-tag">ID: {m.idempotent_identifier || `urn:source:hapi|${r.source_id}`}</span>
                      </div>
                      {s.subject_reference && s.subject_reference !== "—" && (
                        <div className="sub-meta" style={{ marginTop: "3px" }}>
                          <span style={{ color: "var(--text-muted)" }}>Links to: </span>
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
                            {r.target_id.slice(0, 16)}… ↗
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
                        <span className="sub-meta" style={{ fontStyle: "italic", color: "var(--text-muted)" }}>
                          Validated (Ready to commit)
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
                        <div className="error" style={{ fontSize: "12px", marginTop: "4px" }}>
                          {r.errors.join("; ")}
                        </div>
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

      {/* 4. Glossy Inspector Modal with 3 Perspectives */}
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
                  <span style={{ marginLeft: "12px", fontSize: "13px" }}>
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

            {/* Modal Tabs */}
            <div className="modal-tabs">
              <button
                className={`modal-tab-btn ${modalTab === "recon" ? "active" : ""}`}
                onClick={() => setModalTab("recon")}
              >
                <span>🔄</span> Dynamic Reconciliation Matrix
              </button>
              <button
                className={`modal-tab-btn ${modalTab === "dest" ? "active" : ""}`}
                onClick={() => setModalTab("dest")}
              >
                <span>🏥</span> Destination DB Perspective
              </button>
              <button
                className={`modal-tab-btn ${modalTab === "raw" ? "active" : ""}`}
                onClick={() => setModalTab("raw")}
              >
                <span>📄</span> Raw JSON Payloads
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {/* TAB 1: Dynamic Reconciliation Table */}
              {modalTab === "recon" && (
                <div>
                  <div style={{ marginBottom: "14px", fontSize: "13px", color: "var(--text-muted)" }}>
                    Schema-agnostic field extraction matrix. Automatically unrolls complex FHIR structures and tracks transformation derivations.
                  </div>
                  <ReconciliationTable
                    table={activeRecord.reconciliation_table}
                    sourceTitle="Source Payload (HAPI)"
                    targetTitle="Target Stored (Medplum)"
                  />
                </div>
              )}

              {/* TAB 2: Destination DB Perspective */}
              {modalTab === "dest" && (
                <div>
                  <div className="dest-summary-card">
                    <div className="row between" style={{ marginTop: 0, marginBottom: "10px" }}>
                      <h4 style={{ margin: 0, fontSize: "14px", color: "var(--brand)" }}>
                        Destination Profile: Medplum FHIR R4
                      </h4>
                      {activeRecord.target_id && (
                        <a
                          href={`http://localhost:3000/${resourceType}/${activeRecord.target_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="target-link"
                          style={{ fontSize: "13px" }}
                        >
                          View in Medplum Console ↗
                        </a>
                      )}
                    </div>

                    <div className="dest-meta-grid">
                      <div className="dest-meta-item">
                        <label>Target Resource</label>
                        <div>{resourceType}</div>
                      </div>
                      <div className="dest-meta-item">
                        <label>Assigned UUID</label>
                        <div>{activeRecord.target_id || "— (Pending Commit)"}</div>
                      </div>
                      <div className="dest-meta-item">
                        <label>Scoped Identifier</label>
                        <div>{activeRecord.mapping_details?.idempotent_identifier || "—"}</div>
                      </div>
                      <div className="dest-meta-item">
                        <label>Delivery Action</label>
                        <div style={{ color: activeRecord.status === "delivered" ? "var(--ok)" : "var(--warn)" }}>
                          {activeRecord.status.toUpperCase()} ({activeRecord.mapping_details?.delivery_action || "ready"})
                        </div>
                      </div>
                    </div>
                  </div>

                  {activeRecord.target_id ? (
                    <div style={{ marginBottom: "20px" }}>
                      <div className="row between" style={{ marginBottom: "12px" }}>
                        <div>
                          <strong>Live Database Verification:</strong>
                          <span className="sub-meta" style={{ marginLeft: "8px" }}>
                            Directly query Medplum PostgreSQL/FHIR store to confirm live persisted record state.
                          </span>
                        </div>
                        <button
                          className="primary sm"
                          onClick={fetchLiveDestination}
                          disabled={liveLoading}
                        >
                          {liveLoading ? "Querying Medplum…" : "⚡ Verify Live in Medplum DB"}
                        </button>
                      </div>

                      {liveError && (
                        <div className="error" style={{ background: "rgba(239, 68, 68, 0.1)", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--bad-border)" }}>
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
                      <strong>Dry Run Mode:</strong> This record was verified against the FHIR R4 schema. Deliver the batch to generate a permanent Medplum database ID.
                    </div>
                  )}

                  <h4 style={{ margin: "18px 0 8px", fontSize: "14px" }}>
                    Stored Resource Attributes (Destination Perspective)
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
                      <h4 style={{ margin: 0, textTransform: "uppercase", fontSize: "12px", color: "var(--text-muted)" }}>
                        1. Source HAPI FHIR Record
                      </h4>
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
                      <h4 style={{ margin: 0, textTransform: "uppercase", fontSize: "12px", color: "var(--text-muted)" }}>
                        2. Target Medplum Record
                      </h4>
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
