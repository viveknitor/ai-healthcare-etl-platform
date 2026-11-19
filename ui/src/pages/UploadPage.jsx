import { useState, useRef } from "react";
import { api } from "../api.js";
import ReconciliationTable from "../components/ReconciliationTable.jsx";

const STATUS_CLASS = { delivered: "ok", dry_run: "info", invalid: "warn", failed: "bad" };

const SAMPLE_PLANDATA_ROWS = [
  {
    memid: "MEM-100231",
    entityid: "ENT-9940",
    status: "ACTIVE",
    sex: "M",
    fullname: "Quincy Kowalski",
    ssn: "[REDACTED_SOCIAL_SECURITY_NUMBER_1]",
    dob: "1968-05-23",
    deathdate: "",
    marital: "M",
    primarylanguage: "en",
    multiplebirth: "0",
    headofhouse: "MEM-100231",
    guardian: "MEM-100231",
    ExternalId: "EXT-8812",
    secondaryid: "SEC-101",
    enterpriseid: "EMP-900",
    obs_ethnicid: "HISPANIC",
    isvip: "0",
  },
  {
    memid: "MEM-100232",
    entityid: "ENT-9940",
    status: "ACTIVE",
    sex: "F",
    fullname: "Elena Rostova",
    ssn: "[REDACTED_SOCIAL_SECURITY_NUMBER_2]",
    dob: "1975-11-14",
    deathdate: "",
    marital: "M",
    primarylanguage: "es",
    multiplebirth: "0",
    headofhouse: "MEM-100231",
    guardian: "MEM-100231",
    ExternalId: "EXT-8813",
    secondaryid: "SEC-102",
    enterpriseid: "EMP-901",
    obs_ethnicid: "WHITE",
    isvip: "0",
  },
  {
    memid: "MEM-100233",
    entityid: "ENT-9941",
    status: "TERM",
    sex: "M",
    fullname: "Marcus Vance",
    ssn: "[REDACTED_SOCIAL_SECURITY_NUMBER_3]",
    dob: "1982-03-30",
    deathdate: "",
    marital: "S",
    primarylanguage: "en",
    multiplebirth: "0",
    headofhouse: "MEM-100233",
    guardian: "MEM-100233",
    ExternalId: "EXT-8814",
    secondaryid: "SEC-103",
    enterpriseid: "EMP-902",
    obs_ethnicid: "BLACK",
    isvip: "1",
  },
];

export default function UploadPage() {
  const fileInputRef = useRef(null);
  const [fileData, setFileData] = useState(null);
  const [targetResource, setTargetResource] = useState("Patient");
  const [datasetName, setDatasetName] = useState("PlanData-Member");
  const [mapping, setMapping] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [activeRecord, setActiveRecord] = useState(null);
  const [modalTab, setModalTab] = useState("recon");
  const [copiedKey, setCopiedKey] = useState("");

  const handleFileUpload = async (file) => {
    if (!file) return;
    setBusy("upload");
    setError("");
    setReport(null);
    try {
      const data = await api.uploadFile(file);
      setFileData(data);
      setDatasetName(file.name.replace(/\.[^/.]+$/, ""));
      // Automatically propose mapping
      if (data.sample_rows && data.sample_rows.length > 0) {
        setBusy("suggest");
        const suggested = await api.suggestMapping(data.sample_rows[0], targetResource);
        setMapping(suggested);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const loadSamplePlanData = async () => {
    setError("");
    setReport(null);
    const data = {
      filename: "PlanData_dbo_member.csv",
      total_rows: SAMPLE_PLANDATA_ROWS.length,
      sample_rows: SAMPLE_PLANDATA_ROWS,
      all_rows: SAMPLE_PLANDATA_ROWS,
      headers: Object.keys(SAMPLE_PLANDATA_ROWS[0]),
    };
    setFileData(data);
    setDatasetName("PlanData-Member");
    setBusy("suggest");
    try {
      const suggested = await api.suggestMapping(SAMPLE_PLANDATA_ROWS[0], targetResource);
      setMapping(suggested);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const synthesizeMapping = async () => {
    if (!fileData?.sample_rows?.[0]) return;
    setBusy("suggest");
    setError("");
    try {
      const suggested = await api.suggestMapping(fileData.sample_rows[0], targetResource);
      setMapping(suggested);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const approveMapping = async () => {
    if (!mapping) return;
    const updated = { ...mapping, status: "approved" };
    setMapping(updated);
    try {
      await api.saveMapping(updated);
    } catch {
      // save non-fatal
    }
  };

  const editRule = (i, field, value) => {
    const rules = mapping.rules.map((r, j) => (j === i ? { ...r, [field]: value } : r));
    setMapping({ ...mapping, status: "pending_review", rules });
  };

  const removeRule = (i) => {
    setMapping({ ...mapping, status: "pending_review", rules: mapping.rules.filter((_, j) => j !== i) });
  };

  const runIngestion = async (dryRun) => {
    if (!fileData?.all_rows || !mapping) return;
    if (
      !dryRun &&
      !window.confirm(
        `Deliver ${fileData.all_rows.length} records directly to Medplum (${targetResource})? Continue?`
      )
    ) {
      return;
    }
    setBusy(dryRun ? "validating" : "delivering");
    setError("");
    try {
      const res = await api.executeUploadIngestion(
        fileData.all_rows,
        mapping,
        dryRun,
        datasetName
      );
      setReport(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const copyPayload = (key, data) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 2000);
  };

  const approved = mapping?.status === "approved";

  return (
    <section>
      {/* 1. Header Overview Banner */}
      <div className="card">
        <div className="row between" style={{ margin: 0 }}>
          <div>
            <h2>📁 Direct Database &amp; File Ingestion (Without HAPI)</h2>
            <p className="sub-meta" style={{ margin: "2px 0 0" }}>
              Upload arbitrary CSV, TSV, or JSON exports from proprietary databases (e.g. PlanData SQL Server).
              Gemini 3.5 Flash automatically synthesizes and updates the mapping rules dynamically.
            </p>
          </div>
          <span className="chip ok" style={{ alignSelf: "center" }}>
            Direct-to-Medplum Engine
          </span>
        </div>
      </div>

      {/* 2. File Upload Box & PlanData Sample Loader */}
      <div className="card">
        <div className="row between" style={{ marginTop: 0, marginBottom: "14px" }}>
          <h3 style={{ margin: 0, fontSize: "15px" }}>1. Select or Drop Your Data File</h3>
          <button className="secondary sm" onClick={loadSamplePlanData} disabled={!!busy}>
            ⚡ Load Sample PlanData Table (memid, fullname, sex, status)
          </button>
        </div>

        <div
          style={{
            border: "2px dashed var(--card-border)",
            borderRadius: "var(--radius-md)",
            padding: "30px 20px",
            textAlign: "center",
            background: "rgba(0,0,0,0.2)",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleFileUpload(e.target.files?.[0])}
            accept=".csv,.tsv,.json,.txt"
            style={{ display: "none" }}
          />
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>📥</div>
          <div style={{ fontWeight: 600, fontSize: "14px" }}>
            Click to Browse or Drag &amp; Drop CSV, TSV, or JSON File
          </div>
          <div className="sub-meta" style={{ marginTop: "4px" }}>
            Supports SQL Server exports, PlanData tables, EHR extracts, or generic healthcare JSON feeds
          </div>
        </div>

        {fileData && (
          <div style={{ marginTop: "16px" }}>
            <div className="row between" style={{ marginBottom: "8px" }}>
              <div>
                <strong>Loaded File:</strong> <code>{fileData.filename}</code> •{" "}
                <span style={{ color: "var(--brand)", fontWeight: 600 }}>{fileData.total_rows} Records</span>
              </div>
              <div className="row" style={{ margin: 0, gap: "10px" }}>
                <label style={{ margin: 0 }}>
                  Dataset Tag
                  <input
                    value={datasetName}
                    onChange={(e) => setDatasetName(e.target.value)}
                    style={{ width: "160px", padding: "4px 8px" }}
                  />
                </label>
                <label style={{ margin: 0 }}>
                  Target FHIR Resource
                  <input
                    value={targetResource}
                    onChange={(e) => setTargetResource(e.target.value)}
                    style={{ width: "120px", padding: "4px 8px" }}
                  />
                </label>
                <button
                  className="secondary sm"
                  onClick={synthesizeMapping}
                  disabled={!!busy}
                  style={{ alignSelf: "flex-end" }}
                >
                  {busy === "suggest" ? "🤖 AI Reasoning…" : "🔄 Re-Synthesize Mapping"}
                </button>
              </div>
            </div>

            {/* Preview of first 3 rows */}
            <h4 style={{ margin: "14px 0 6px", fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)" }}>
              Data Preview (First {fileData.sample_rows?.length || 0} rows)
            </h4>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    {fileData.headers?.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fileData.sample_rows?.map((row, i) => (
                    <tr key={i}>
                      {fileData.headers?.map((h) => (
                        <td key={h}>{String(row[h] ?? "—")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 3. AI Synthesized Mapping Rules Gate */}
      {mapping && (() => {
        const mappedSources = new Set(mapping?.rules?.map((r) => r.source) || []);
        const allHeaders = fileData?.headers || [];
        const unmappedHeaders = allHeaders.filter((h) => !mappedSources.has(h));

        return (
          <div className="card">
            <div className="row between" style={{ marginTop: 0, marginBottom: "12px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "15px" }}>
                  2. AI Synthesized Mapping Contract: <code>{mapping.name}</code>
                </h3>
                <p className="sub-meta">
                  Google Gemini detected column semantics and synthesized FHIR R4 transformation rules automatically.
                </p>
              </div>
              <span className={`chip ${approved ? "ok" : "warn"}`}>
                {approved ? "✓ Approved" : "Pending Review"}
              </span>
            </div>

            {/* Field Coverage Analysis Bar */}
            <div
              style={{
                background: "rgba(0,0,0,0.25)",
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                marginBottom: "14px",
                border: "1px solid var(--card-border)",
              }}
            >
              <div className="row between" style={{ margin: 0 }}>
                <div>
                  <strong>Field Coverage Analysis: </strong>
                  <span style={{ color: "var(--ok)", fontWeight: 700 }}>
                    {mappedSources.size} Mapped
                  </span>
                  {" • "}
                  <span
                    style={{
                      color: unmappedHeaders.length > 0 ? "var(--warn)" : "var(--ok)",
                      fontWeight: 700,
                    }}
                  >
                    {unmappedHeaders.length} Unmapped / Skipped
                  </span>
                  {" / "}
                  <span>{allHeaders.length} Total Columns</span>
                </div>
                <span className={`chip ${unmappedHeaders.length === 0 ? "ok" : "warn"}`}>
                  {Math.round((mappedSources.size / Math.max(1, allHeaders.length)) * 100)}% Coverage
                </span>
              </div>

              {unmappedHeaders.length > 0 && (
                <div style={{ marginTop: "8px", fontSize: "12px" }}>
                  <div className="row between" style={{ margin: "0 0 6px" }}>
                    <span style={{ color: "var(--text-muted)" }}>
                      Unmapped / Skipped Columns (Click to add as FHIR Extension):
                    </span>
                    <button
                      className="secondary sm"
                      style={{ fontSize: "11px", padding: "2px 8px" }}
                      onClick={() => {
                        let extIdx = mapping.rules.filter(
                          (r) => r.target && r.target.startsWith("extension[")
                        ).length;
                        const newRules = unmappedHeaders.map((col) => ({
                          source: col,
                          target: `extension[${extIdx++}].valueString`,
                          transform: "direct",
                          confidence: 0.85,
                          rationale: `Mapped ${col} as custom extension`,
                        }));
                        setMapping({
                          ...mapping,
                          status: "pending_review",
                          rules: [...mapping.rules, ...newRules],
                        });
                      }}
                      title="Automatically map all remaining unmapped columns as FHIR R4 Extensions"
                    >
                      ✨ Map All Remaining as Extensions
                    </button>
                  </div>
                  {unmappedHeaders.map((col) => (
                    <span
                      key={col}
                      className="rule-tag"
                      style={{
                        cursor: "pointer",
                        background: "rgba(245, 158, 11, 0.1)",
                        color: "var(--warn)",
                        borderColor: "rgba(245, 158, 11, 0.3)",
                      }}
                      onClick={() => {
                        const existingExtCount = mapping.rules.filter(
                          (r) => r.target && r.target.startsWith("extension[")
                        ).length;
                        const newRule = {
                          source: col,
                          target: `extension[${existingExtCount}].valueString`,
                          transform: "direct",
                          confidence: 0.85,
                          rationale: `Mapped ${col} as custom extension`,
                        };
                        setMapping({
                          ...mapping,
                          status: "pending_review",
                          rules: [...mapping.rules, newRule],
                        });
                      }}
                      title={`Click to map "${col}" as a FHIR Extension`}
                    >
                      + {col}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <table>
              <thead>
                <tr>
                  <th style={{ width: "22%" }}>Source Column</th>
                  <th style={{ width: "30%" }}>Target FHIR Path</th>
                  <th style={{ width: "20%" }}>Transform</th>
                  <th style={{ width: "12%" }}>Confidence</th>
                  <th style={{ width: "10%", textAlign: "right" }} />
                </tr>
              </thead>
              <tbody>
                {mapping.rules?.map((r, i) => (
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
                        <span
                          className={`chip ${r.confidence >= 0.8 ? "ok" : "warn"}`}
                          style={{ fontSize: "11px", padding: "1px 6px" }}
                        >
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

            <div className="row between" style={{ marginTop: "16px" }}>
              <button
                className={approved ? "secondary" : "primary"}
                onClick={approveMapping}
                disabled={approved}
              >
                {approved ? "✓ Schema Approved & Saved" : "✓ Approve & Save Mapping"}
              </button>

              <div className="row" style={{ margin: 0, gap: "10px" }}>
                <button
                  className="secondary"
                  onClick={() => runIngestion(true)}
                  disabled={!approved || !!busy}
                >
                  {busy === "validating" ? "Validating…" : `🔍 Run Dry Run (${fileData?.total_rows || 0})`}
                </button>

                <button
                  className="primary success"
                  onClick={() => runIngestion(false)}
                  disabled={!approved || !!busy}
                >
                  {busy === "delivering"
                    ? "Ingesting to Medplum…"
                    : `⚡ Ingest All ${fileData?.total_rows || 0} to Medplum`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {error && <div className="error">{error}</div>}

      {/* 4. Ingestion Results Table & Medplum Persisted Record Inspector */}
      {report && (
        <div className="card">
          <div className="row between" style={{ marginTop: 0, marginBottom: "12px" }}>
            <div>
              <h2>Ingestion Results: {fileData?.filename}</h2>
              <p className="sub-meta">
                Processed {report.summary?.total} records using mapping <code>{mapping?.name}</code>.
              </p>
            </div>

            <div className="chips" style={{ margin: 0 }}>
              <span className="chip">Total: {report.summary?.total}</span>
              {Object.entries(report.summary?.counts || {}).map(([k, v]) => (
                <span key={k} className={`chip ${STATUS_CLASS[k] || ""}`}>
                  {k}: {v}
                </span>
              ))}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style={{ width: "6%" }}>#</th>
                <th style={{ width: "20%" }}>Source Identifier</th>
                <th style={{ width: "26%" }}>Clinical / Demographics</th>
                <th style={{ width: "22%" }}>Target Medplum Link</th>
                <th style={{ width: "14%" }}>Status</th>
                <th style={{ width: "12%", textAlign: "right" }}>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {report.results?.map((r, i) => {
                const s = r.patient_summary || {};
                const m = r.mapping_details || {};
                const deliveryAction = m.delivery_action;

                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      <strong>{r.source_id}</strong>
                      <div className="sub-meta">Tag: {datasetName}</div>
                    </td>
                    <td>
                      <div style={{ color: "var(--brand)", fontWeight: 600 }}>{s.title || "Record"}</div>
                      <div className="sub-meta">{s.subtitle || s.primary_value || "—"}</div>
                    </td>
                    <td>
                      {r.target_id ? (
                        <div>
                          <a
                            href={`http://localhost:3000/${targetResource}/${r.target_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="target-link"
                          >
                            {r.target_id.slice(0, 16)}… ↗
                          </a>
                          <div className="sub-meta" style={{ color: "var(--ok)", fontWeight: 600 }}>
                            {deliveryAction === "created" ? "+ Created in Medplum" : "↻ Updated in Medplum"}
                          </div>
                        </div>
                      ) : r.status === "dry_run" ? (
                        <span className="sub-meta" style={{ fontStyle: "italic" }}>
                          Validated (Ready to commit)
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <span className={`chip ${STATUS_CLASS[r.status] || ""}`}>{r.status}</span>
                      {r.errors && r.errors.length > 0 && (
                        <div className="error" style={{ fontSize: "11px", marginTop: "4px" }}>
                          {r.errors.join("; ")}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="secondary sm" onClick={() => setActiveRecord(r)}>
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

      {/* Inspector Modal */}
      {activeRecord && (
        <div className="modal-overlay" onClick={() => setActiveRecord(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0, marginBottom: "4px" }}>
                  Record Mapping Inspector: <code>{activeRecord.source_id}</code>
                </h3>
                <span className={`chip ${STATUS_CLASS[activeRecord.status] || ""}`}>
                  Status: {activeRecord.status}
                </span>
                {activeRecord.target_id && (
                  <span style={{ marginLeft: "12px", fontSize: "13px" }}>
                    Medplum ID:{" "}
                    <a
                      href={`http://localhost:3000/${targetResource}/${activeRecord.target_id}`}
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

            <div className="modal-tabs">
              <button
                className={`modal-tab-btn ${modalTab === "recon" ? "active" : ""}`}
                onClick={() => setModalTab("recon")}
              >
                <span>🔄</span> Dynamic Reconciliation Matrix
              </button>
              <button
                className={`modal-tab-btn ${modalTab === "raw" ? "active" : ""}`}
                onClick={() => setModalTab("raw")}
              >
                <span>📄</span> Raw JSON Payloads
              </button>
            </div>

            <div className="modal-body">
              {modalTab === "recon" && (
                <ReconciliationTable
                  table={activeRecord.reconciliation_table}
                  sourceTitle="Source Uploaded Record"
                  targetTitle={`Target ${targetResource} Stored`}
                />
              )}

              {modalTab === "raw" && (
                <div className="grid2">
                  <div className="pane">
                    <div className="row between" style={{ margin: "0 0 8px" }}>
                      <h4 style={{ margin: 0 }}>Source Row</h4>
                      <button className="secondary sm" onClick={() => copyPayload("src", activeRecord.source_record)}>
                        {copiedKey === "src" ? "✓ Copied" : "Copy Source"}
                      </button>
                    </div>
                    <pre>{JSON.stringify(activeRecord.source_record, null, 2)}</pre>
                  </div>
                  <div className="pane">
                    <div className="row between" style={{ margin: "0 0 8px" }}>
                      <h4 style={{ margin: 0 }}>Target Medplum Resource</h4>
                      <button className="secondary sm" onClick={() => copyPayload("tgt", activeRecord.target_record)}>
                        {copiedKey === "tgt" ? "✓ Copied" : "Copy Target"}
                      </button>
                    </div>
                    <pre>{JSON.stringify(activeRecord.target_record, null, 2)}</pre>
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

