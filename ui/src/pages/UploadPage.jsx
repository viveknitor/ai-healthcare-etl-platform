import { useState, useRef } from "react";
import { api } from "../api.js";
import ReconciliationTable from "../components/ReconciliationTable.jsx";
import AgentWorkflowVisualizer from "../components/AgentWorkflowVisualizer.jsx";
import MappingContractViewer from "../components/MappingContractViewer.jsx";

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
  const [isValidated, setIsValidated] = useState(false);
  const [isDelivered, setIsDelivered] = useState(false);
  const [llmMetrics, setLlmMetrics] = useState(null);
  const [healedChanges, setHealedChanges] = useState([]);
  const [streamState, setStreamState] = useState({
    active: false,
    current: 0,
    total: 0,
    speed: 0,
    eta: 0,
    percent: 0,
  });
  const abortControllerRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const handleFileUpload = async (file) => {
    if (!file) return;
    setBusy("upload");
    setError("");
    setReport(null);
    setIsValidated(false);
    setIsDelivered(false);
    try {
      const data = await api.uploadFile(file);
      setFileData(data);
      setDatasetName(file.name.replace(/\.[^/.]+$/, ""));
      // Automatically propose mapping
      if (data.sample_rows && data.sample_rows.length > 0) {
        setBusy("suggest");
        const suggested = await api.suggestMapping(data.sample_rows[0], targetResource);
        setMapping(suggested);
        if (suggested?.metadata?.llm_metrics) {
          setLlmMetrics(suggested.metadata.llm_metrics);
        }
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
    setIsValidated(false);
    setIsDelivered(false);
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
      if (suggested?.metadata?.llm_metrics) {
        setLlmMetrics(suggested.metadata.llm_metrics);
      }
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
    setIsValidated(false);
    setIsDelivered(false);
    try {
      const suggested = await api.suggestMapping(fileData.sample_rows[0], targetResource);
      setMapping(suggested);
      if (suggested?.metadata?.llm_metrics) {
        setLlmMetrics(suggested.metadata.llm_metrics);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const approveMapping = async () => {
    if (!mapping) return;
    const updated = {
      ...mapping,
      name: `${targetResource.toLowerCase()}_mapping`,
      status: "approved",
    };
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
    setIsValidated(false);
    setIsDelivered(false);
  };

  const removeRule = (i) => {
    setMapping({ ...mapping, status: "pending_review", rules: mapping.rules.filter((_, j) => j !== i) });
    setIsValidated(false);
    setIsDelivered(false);
  };

  const stopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setStreamState((prev) => ({ ...prev, active: false }));
      setBusy("");
    }
  };

  const runIngestion = async (dryRun) => {
    if (!fileData?.all_rows || !mapping) return;

    // Quality Gate: Mandatory validation before delivering to Medplum
    if (!dryRun && !isValidated) {
      alert("🛡️ Mandatory Quality Gate: Pre-flight validation is required before delivering to Medplum. Please run 'Step 1: Validate Schema' first.");
      return;
    }

    if (
      !dryRun &&
      !window.confirm(
        `Deliver ${fileData.all_rows.length} validated records directly to Medplum (${targetResource})? Continue?`
      )
    ) {
      return;
    }

    setBusy(dryRun ? "validating" : "delivering");
    setError("");
    setCurrentPage(1);

    const total = fileData.all_rows.length;
    setStreamState({
      active: true,
      current: 0,
      total,
      speed: 0,
      eta: 0,
      percent: 0,
    });

    setReport({
      summary: { total, counts: { delivered: 0, dry_run: 0, invalid: 0, failed: 0 } },
      results: [],
    });

    const startTime = performance.now();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await api.executeUploadIngestionStream({
        rows: fileData.all_rows,
        mapping,
        dry_run: dryRun,
        dataset_name: datasetName,
        signal: controller.signal,
        onRecord: (event) => {
          setReport((prev) => ({
            summary: {
              total: event.total,
              counts: event.current_counts,
            },
            results: [...(prev?.results || []), event.result],
          }));

          const elapsedSec = (performance.now() - startTime) / 1000;
          const speed = elapsedSec > 0 ? Math.round(event.index / elapsedSec) : 0;
          const remaining = event.total - event.index;
          const eta = speed > 0 ? (remaining / speed).toFixed(1) : 0;

          setStreamState({
            active: true,
            current: event.index,
            total: event.total,
            speed,
            eta,
            percent: Math.round((event.index / event.total) * 100),
          });
        },
        onComplete: (completeEvent) => {
          setStreamState((prev) => ({ ...prev, active: false, percent: 100 }));
          setBusy("");
          const counts = completeEvent.summary?.counts || {};
          const hasErr = (counts.invalid || 0) > 0 || (counts.failed || 0) > 0;
          if (dryRun) {
            if (!hasErr && (completeEvent.summary?.total || 0) > 0) {
              setIsValidated(true);
              setIsDelivered(false);
            } else {
              setIsValidated(false);
            }
          } else {
            setIsDelivered(true);
          }
        },
        onError: (err) => {
          setError(`Streaming error: ${err.message}`);
          setStreamState((prev) => ({ ...prev, active: false }));
          setBusy("");
        },
      });
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message);
      }
      setStreamState((prev) => ({ ...prev, active: false }));
      setBusy("");
    }
  };

  const triggerSelfHeal = async (currentReport = report) => {
    if (!currentReport?.results || !fileData?.sample_rows?.[0] || !mapping) return;
    const errors = Array.from(
      new Set(currentReport.results.flatMap((r) => r.errors || []).filter(Boolean))
    );
    if (errors.length === 0) return;

    setBusy("healing");
    setError("");
    try {
      const healRes = await api.autoHealMapping(mapping, fileData.sample_rows[0], errors);
      if (healRes.ok && healRes.mapping) {
        const approvedMapping = { ...healRes.mapping, status: "approved" };
        setMapping(approvedMapping);
        if (healRes.metadata?.llm_metrics) {
          setLlmMetrics(healRes.metadata.llm_metrics);
        }
        setHealedChanges(healRes.changes || ["Auto-repaired schema violations"]);
        setBusy("");
      }
    } catch (e) {
      setError(`AI Self-Healing failed: ${e.message}`);
      setBusy("");
    }
  };

  const copyPayload = (key, data) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 2000);
  };

  const downloadCSVReport = () => {
    if (!report?.results || report.results.length === 0) return;

    // Merge all original source input columns (all 27+ fields) with ETL execution & Medplum linkage columns
    const rows = report.results.map((r, i) => {
      const srcRecord = r.source_record || fileData?.all_rows?.[i] || {};
      return {
        "#": i + 1,
        "ETL Status": r.status === "dry_run" ? "validated" : r.status,
        "Target Medplum ID": r.target_id || "—",
        "Medplum URL": r.target_id ? `http://localhost:3000/Patient/${r.target_id}` : "—",
        "Scoped Identifier": r.mapping_details?.idempotent_identifier || "—",
        ...srcRecord,
        "ETL Errors": (r.errors || []).join(" | "),
      };
    });

    // Collect all distinct headers preserving all 27+ original input columns
    const headerSet = new Set();
    rows.forEach((row) => Object.keys(row).forEach((k) => headerSet.add(k)));
    const headers = Array.from(headerSet);

    // Prepend UTF-8 BOM (\uFEFF) so Microsoft Excel opens it directly without character corruption
    const csvContent =
      "\uFEFF" +
      [
        headers.join(","),
        ...rows.map((row) =>
          headers
            .map((h) => `"${String(row[h] !== undefined && row[h] !== null ? row[h] : "").replace(/"/g, '""')}"`)
            .join(",")
        ),
      ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${datasetName}_Medplum_Full_Audit_Report.csv`;
    link.click();
  };

  const downloadJSONReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${datasetName}_Medplum_Ingestion_Bundle.json`;
    link.click();
  };

  const filteredResults = (report?.results || []).filter((r) => {
    if (statusFilter !== "ALL") {
      const actualStatus = r.status === "dry_run" ? "validated" : r.status;
      if (actualStatus !== statusFilter && r.status !== statusFilter) return false;
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchId = String(r.source_id || "").toLowerCase().includes(q);
      const matchTitle = String(r.patient_summary?.title || "").toLowerCase().includes(q);
      const matchTarget = String(r.target_id || "").toLowerCase().includes(q);
      if (!matchId && !matchTitle && !matchTarget) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  const paginatedResults = filteredResults.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const approved = mapping?.status === "approved";

  return (
    <section>
      {/* 1. Header Overview Banner */}
      <div className="card">
        <div className="row between" style={{ margin: 0 }}>
          <div>
            <h2>📁 Direct Database &amp; File Ingestion (QNEXT)</h2>
            <p className="sub-meta" style={{ margin: "2px 0 0" }}>
              Upload arbitrary CSV, Excel (.xlsx), TSV, or JSON exports from proprietary databases (QNEXT / PlanData SQL Server).
              Gemini 3.5 Flash automatically synthesizes and updates the mapping rules dynamically.
            </p>
          </div>
          <span className="chip ok" style={{ alignSelf: "center" }}>
            Direct-to-Medplum Engine
          </span>
        </div>
      </div>

      {/* 2. Autonomous Multi-Agent Stepper */}
      <AgentWorkflowVisualizer
        llmMetrics={mapping?.metadata?.llm_metrics || llmMetrics}
        datasetName={datasetName}
        recordsCount={fileData?.total_rows || 0}
        approved={approved}
        validated={isValidated}
        delivered={isDelivered}
        healingHistory={mapping?.metadata?.healing_history || []}
        onApprove={approveMapping}
      />

      {/* 3. File Upload Box & PlanData Sample Loader */}
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
            accept=".csv,.tsv,.json,.xlsx,.txt"
            style={{ display: "none" }}
          />
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>📥</div>
          <div style={{ fontWeight: 600, fontSize: "14px" }}>
            Click to Browse or Drag &amp; Drop CSV, Excel (.xlsx), TSV, or JSON File
          </div>
          <div className="sub-meta" style={{ marginTop: "4px" }}>
            Supports SQL Server exports, Excel spreadsheets (.xlsx), PlanData tables, EHR extracts, or generic healthcare JSON feeds
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
        const deliveredCount = report?.summary?.counts?.delivered || 0;
        const hasDelivered = (isDelivered || deliveredCount > 0) && (report?.summary?.counts?.dry_run || 0) === 0;

        return (
          <>
            <MappingContractViewer
              mapping={mapping}
              onEditRule={editRule}
              onRemoveRule={removeRule}
              approved={approved}
              allHeaders={allHeaders}
              mappedSources={mappedSources}
              unmappedHeaders={unmappedHeaders}
              onMapAllRemaining={() => {
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
                setIsValidated(false);
                setIsDelivered(false);
              }}
              onMapSingleExtension={(col) => {
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
                setIsValidated(false);
                setIsDelivered(false);
              }}
            />

            {/* Quality Action Gate: Mandatory Validation before Delivery */}
            <div
              className="card"
              style={{
                marginTop: "12px",
                padding: "14px 20px",
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <div className="row between" style={{ margin: 0, alignItems: "center" }}>
                <div>
                  <button
                    className={approved ? "secondary" : "primary"}
                    onClick={approveMapping}
                    disabled={approved}
                  >
                    {approved ? "✓ Schema Approved & Saved" : "✓ Approve & Save Mapping"}
                  </button>
                  <span style={{ marginLeft: "12px", fontSize: "11px", color: "var(--text-muted)" }}>
                    {approved ? "Quality gate cleared for validation." : "Review and approve contract to unlock validation."}
                  </span>
                </div>

                <div className="row" style={{ margin: 0, gap: "10px", alignItems: "center" }}>
                  <button
                    className={`secondary ${isValidated ? "ok" : ""}`}
                    onClick={() => runIngestion(true)}
                    disabled={!approved || !!busy}
                    title="Execute mandatory FHIR schema validation"
                    style={{ minWidth: "190px" }}
                  >
                    {busy === "healing"
                      ? "🩹 Auto-Healing Rules…"
                      : busy === "validating"
                      ? "Validating Schema…"
                      : isValidated
                      ? `✓ Validated (${fileData?.total_rows || 0})`
                      : `🛡️ Step 1: Validate Schema (${fileData?.total_rows || 0})`}
                  </button>

                  <button
                    className={`primary success ${hasDelivered ? "delivered-btn" : !isValidated ? "disabled-btn" : ""}`}
                    onClick={() => runIngestion(false)}
                    disabled={!approved || !!busy}
                    style={{
                      minWidth: "210px",
                      background: hasDelivered
                        ? "linear-gradient(135deg, #059669 0%, #10b981 100%)"
                        : undefined,
                      boxShadow: hasDelivered
                        ? "0 0 16px rgba(16, 185, 129, 0.45)"
                        : undefined,
                      borderColor: hasDelivered ? "rgba(52, 211, 153, 0.6)" : undefined,
                    }}
                    title={
                      hasDelivered
                        ? `All ${deliveredCount || fileData?.total_rows || 0} records have been successfully delivered to Medplum. Click to re-run ingestion if needed.`
                        : isValidated
                        ? "Deliver to Medplum"
                        : "Pre-flight validation required before delivery"
                    }
                  >
                    {busy === "delivering"
                      ? "Ingesting to Medplum…"
                      : hasDelivered
                      ? `✓ Delivered All ${deliveredCount || fileData?.total_rows || 0} to Medplum`
                      : !isValidated
                      ? `⚡ Step 2: Ingest (${fileData?.total_rows || 0})`
                      : `⚡ Deliver All ${fileData?.total_rows || 0} to Medplum`}
                  </button>
                </div>
              </div>

              {/* Dynamic Auto-Heal Trigger Banner on Failure */}
              {report && (report.summary?.counts?.invalid > 0 || report.summary?.counts?.failed > 0) && (
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    borderRadius: "var(--radius-md)",
                    padding: "12px 18px",
                    marginTop: "12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div>
                    <strong style={{ color: "var(--bad)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>🚨 Schema Violations Detected</span>
                      <span className="chip bad" style={{ fontSize: "11px" }}>
                        {report.summary?.counts?.invalid || 0} Records Invalid
                      </span>
                    </strong>
                    <div className="sub-meta" style={{ margin: "3px 0 0" }}>
                      Gemini Self-Healing Agent can inspect the exact FHIR R4 schema errors, heal the target rules, and re-test automatically.
                    </div>
                  </div>

                  <button
                    className="primary"
                    onClick={() => triggerSelfHeal()}
                    disabled={!!busy}
                    style={{
                      background: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
                      borderColor: "rgba(255, 255, 255, 0.3)",
                      boxShadow: "0 4px 14px rgba(236, 72, 153, 0.4)",
                    }}
                  >
                    {busy === "healing" ? "🩹 Diagnosing & Healing Schema…" : "🩹 AI Auto-Heal Contract with Gemini"}
                  </button>
                </div>
              )}

              {/* Self-Healing Success Telemetry Banner */}
              {healedChanges.length > 0 && (
                <div
                  style={{
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.35)",
                    borderRadius: "var(--radius-md)",
                    padding: "12px 18px",
                    marginTop: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "var(--ok)", fontSize: "13px" }}>
                    <span>✓ AI Closed-Loop Self-Healing Certified:</span>
                    <span style={{ fontWeight: 400, color: "#fff" }}>Contract repaired and re-validated</span>
                  </div>
                  <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: "12px", color: "var(--text)" }}>
                    {healedChanges.map((c, idx) => (
                      <li key={idx} style={{ marginTop: "2px" }}>
                        <code>{c}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {error && <div className="error">{error}</div>}

      {/* 4. Ingestion Results Table & Medplum Persisted Record Inspector */}
      {report && (
        <div className="card">
          {/* Live Real-Time Streaming Progress Dashboard */}
          {(streamState.active || streamState.current > 0) && (
            <div
              style={{
                background: "linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.8) 100%)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                borderRadius: "var(--radius-md)",
                padding: "14px 18px",
                marginBottom: "16px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              }}
            >
              <div className="row between" style={{ margin: "0 0 8px", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "16px" }}>{streamState.active ? "⚡" : "✓"}</span>
                  <strong style={{ fontSize: "14px", color: "#fff" }}>
                    {streamState.active ? "Live Row-by-Row Streaming Active" : "Ingestion Processing Complete"}
                  </strong>
                  <span className={`chip ${streamState.active ? "info" : "ok"}`} style={{ fontSize: "11px" }}>
                    {streamState.current} / {streamState.total} Records ({streamState.percent}%)
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px" }}>
                  <span style={{ color: "var(--brand)" }}>
                    🚀 <strong>{streamState.speed}</strong> rec/sec
                  </span>
                  {streamState.active && (
                    <span style={{ color: "var(--text-muted)" }}>
                      ⏱️ Est. Remaining: <strong>{streamState.eta}s</strong>
                    </span>
                  )}
                  {streamState.active && (
                    <button className="danger sm" onClick={stopStream} style={{ padding: "3px 8px", fontSize: "11px" }}>
                      ⏹ Stop Stream
                    </button>
                  )}
                </div>
              </div>

              {/* Animated Progress Bar */}
              <div
                style={{
                  width: "100%",
                  height: "8px",
                  background: "rgba(255, 255, 255, 0.1)",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${streamState.percent}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #38bdf8 0%, #3b82f6 50%, #10b981 100%)",
                    borderRadius: "4px",
                    transition: "width 0.15s ease",
                    boxShadow: "0 0 10px rgba(56, 189, 248, 0.5)",
                  }}
                />
              </div>
            </div>
          )}

          <div className="row between" style={{ marginTop: 0, marginBottom: "12px" }}>
            <div>
              <h2>Ingestion Results: {fileData?.filename}</h2>
              <p className="sub-meta">
                Streamed {report.results?.length || 0} of {report.summary?.total} records using mapping <code>{mapping?.name}</code>.
              </p>
            </div>

            <div className="chips" style={{ margin: 0, display: "flex", gap: "8px", alignItems: "center" }}>
              <span className="chip">Total: {report.summary?.total}</span>
              {Object.entries(report.summary?.counts || {}).map(([k, v]) => (
                <span key={k} className={`chip ${STATUS_CLASS[k] || ""}`}>
                  {k === "dry_run" ? "validated" : k}: {v}
                </span>
              ))}
              <button
                className="secondary sm"
                onClick={downloadCSVReport}
                title="Download spreadsheet report that opens natively in Microsoft Excel"
                style={{ marginLeft: "6px" }}
              >
                📥 Download Excel CSV
              </button>
              <button
                className="secondary sm"
                onClick={downloadJSONReport}
                title="Download complete JSON audit package"
              >
                💾 Download JSON
              </button>
            </div>
          </div>

          {/* High-Volume Search & Pagination Filter Bar */}
          <div
            className="row between"
            style={{
              margin: "0 0 12px",
              padding: "8px 12px",
              background: "rgba(0,0,0,0.25)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--card-border)",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="🔍 Search ID or Name..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                style={{ width: "190px", padding: "4px 8px", fontSize: "12px" }}
              />
              <div style={{ display: "flex", gap: "4px" }}>
                {["ALL", "delivered", "dry_run", "invalid", "failed"].map((st) => {
                  const count =
                    st === "ALL"
                      ? report.results?.length || 0
                      : report.summary?.counts?.[st] || 0;
                  if (st !== "ALL" && count === 0) return null;
                  return (
                    <button
                      key={st}
                      className={`secondary sm ${statusFilter === st ? "active-pill" : ""}`}
                      style={{ fontSize: "11px", padding: "3px 8px" }}
                      onClick={() => {
                        setStatusFilter(st);
                        setCurrentPage(1);
                      }}
                    >
                      {st === "dry_run" ? "validated" : st} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px" }}>
              <span style={{ color: "var(--text-muted)" }}>
                Showing {filteredResults.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, filteredResults.length)} of {filteredResults.length}
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{ padding: "3px 6px", fontSize: "12px" }}
              >
                <option value={15}>15 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
              <div style={{ display: "flex", gap: "4px" }}>
                <button
                  className="secondary sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  style={{ padding: "3px 8px", fontSize: "11px" }}
                >
                  ← Prev
                </button>
                <span style={{ padding: "3px 6px", fontWeight: 600 }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  className="secondary sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  style={{ padding: "3px 8px", fontSize: "11px" }}
                >
                  Next →
                </button>
              </div>
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
              {paginatedResults.map((r, idx) => {
                const i = (currentPage - 1) * pageSize + idx;
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

