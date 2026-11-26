import React from "react";
import { formatHumanTableRowError } from "../modals/EditRecordModal.jsx";

const STATUS_CLASS = { delivered: "ok", dry_run: "info", invalid: "bad", failed: "bad" };

export default function Step4ReconciliationHub({
  fileData,
  report,
  mapping,
  targetResource,
  datasetName,
  busy,
  streamProgress,
  scenarioCounts,
  statusFilter,
  setStatusFilter,
  searchTerm,
  setSearchTerm,
  currentPage,
  setCurrentPage,
  pageSize,
  setPageSize,
  paginatedResults,
  filteredResults,
  totalPages,
  onRunIngestion,
  onDownloadReport,
  onDownloadJSON,
  onStartAddRecord,
  onStartEdit,
  onDeleteRecord,
  onInspectRecord,
}) {
  const pendingValidCount = scenarioCounts.validated || 0;
  const deliveredCount = scenarioCounts.delivered || 0;
  const invalidCount = scenarioCounts.invalid || 0;
  const failedCount = scenarioCounts.failed || 0;
  const attentionCount = invalidCount + failedCount;
  const isDeliveredComplete = deliveredCount > 0 && pendingValidCount === 0;
  const canDeliver = pendingValidCount > 0;

  let deliverLabel = `⚡ Deliver All ${fileData?.total_rows || 0} to Medplum`;
  if (busy === "ingest") {
    deliverLabel = "⚡ Ingesting to Medplum in Progress…";
  } else if (pendingValidCount > 0 && deliveredCount > 0) {
    deliverLabel = `⚡ Deliver ${pendingValidCount} Pending to Medplum`;
  } else if (pendingValidCount > 0 && attentionCount > 0) {
    deliverLabel = `⚡ Deliver ${pendingValidCount} Validated (Quarantine ${attentionCount})`;
  } else if (pendingValidCount > 0) {
    deliverLabel = `⚡ Deliver All ${pendingValidCount} to Medplum`;
  } else if (isDeliveredComplete && attentionCount > 0) {
    deliverLabel = `✓ Delivered ${deliveredCount} to Medplum (${attentionCount} Excluded)`;
  } else if (isDeliveredComplete) {
    deliverLabel = `✓ Delivered All ${deliveredCount} to Medplum`;
  } else if (report) {
    deliverLabel = "⚡ Deliver 0 Validated";
  }

  return (
    <div className="wizard-step-pane">
      {/* 1. Ingestion Control Bar */}
      <div className="section-header-row" style={{ alignItems: "center" }}>
        <div>
          <h3 className="section-title">Step 4: Live Delivery, Reconciliation &amp; Audit</h3>
          <p className="sub-meta">
            Stream validated records to Medplum with dynamic reconciliation and partial quarantine safety
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            className={`primary ${isDeliveredComplete && busy !== "ingest" ? "delivered-complete" : ""}`}
            onClick={() => onRunIngestion(false)}
            disabled={!canDeliver || !!busy}
            title={
              isDeliveredComplete
                ? `All ${deliveredCount} valid records are delivered to Medplum. Re-validate in Step 3 or edit/add a record to sync again.`
                : "Stream validated records to Medplum"
            }
            style={{
              padding: "9px 18px",
              fontWeight: 700,
              fontSize: "13px",
              ...(canDeliver && !busy
                ? {
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    borderColor: "rgba(16, 185, 129, 0.4)",
                    boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                  }
                : {}),
            }}
          >
            {deliverLabel}
          </button>
        </div>
      </div>

      {/* 2. High-Speed Live Ingestion Streaming Progress Bar */}
      {streamProgress && (
        <div
          className="card"
          style={{
            margin: "0 0 16px",
            padding: "14px 18px",
            background: "linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.8) 100%)",
            border: "1px solid rgba(56, 189, 248, 0.3)",
          }}
        >
          <div className="row between" style={{ margin: "0 0 6px", fontSize: "12px", alignItems: "center" }}>
            <span style={{ fontWeight: 600 }}>
              {streamProgress.mode === "validate"
                ? streamProgress.isComplete
                  ? "✓ Pre-Flight Validation Complete"
                  : "🛡️ Validating Records via Pre-Flight Pipeline…"
                : streamProgress.isComplete
                  ? "✓ Live Delivery to Medplum Complete"
                  : "🚀 Delivering Records to Medplum…"}
              <span className="chip brand sm" style={{ marginLeft: "8px" }}>
                {streamProgress.current} / {streamProgress.total} Records ({streamProgress.percent}%)
              </span>
            </span>
            <span style={{ color: "var(--brand)", fontWeight: 700 }}>
              ⚡ {streamProgress.recordsPerSec} rec/sec
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: "8px",
              background: "rgba(0,0,0,0.4)",
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${streamProgress.percent}%`,
                height: "100%",
                background: "linear-gradient(90deg, #38bdf8 0%, #34d399 100%)",
                transition: "width 0.15s ease",
                boxShadow: "0 0 10px rgba(56, 189, 248, 0.5)",
              }}
            />
          </div>
        </div>
      )}

      {/* 3. Ingestion Results, Scenario KPI Badges & Multi-Download Toolbar */}
      {report && (
        <>
          <div id="ingestion-results-section" style={{ marginTop: 0, marginBottom: "16px" }}>
            <div className="row between" style={{ alignItems: "flex-start", marginBottom: "12px" }}>
              <div>
                <h4 style={{ margin: 0, fontSize: "16px" }}>Batch Results: {fileData?.filename}</h4>
                <p className="sub-meta" style={{ marginTop: "4px" }}>
                  Streamed {report.results?.length || 0} of {report.summary?.total} records using mapping <code>{mapping?.name}</code>.
                </p>
              </div>

              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  className="primary sm"
                  onClick={onStartAddRecord}
                  title="Add a new record to this batch"
                >
                  ➕ Add Record
                </button>
              </div>
            </div>

            {/* Scenario Metrics & Download Hub Banner */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                padding: "12px 16px",
                background: "rgba(15, 23, 42, 0.65)",
                border: "1px solid var(--card-border)",
                borderRadius: "var(--radius-md)",
                marginBottom: "12px",
              }}
            >
              {/* Scenario KPI Badges */}
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <span className="chip" style={{ fontWeight: 600 }}>Total: {report.summary?.total || 0}</span>
                {scenarioCounts.delivered > 0 && (
                  <span className="chip ok" title={`${scenarioCounts.created} Created, ${scenarioCounts.updated} Updated`}>
                    ✓ Delivered: {scenarioCounts.delivered}
                    {scenarioCounts.created > 0 && <span style={{ opacity: 0.85, fontSize: "11px", marginLeft: "4px" }}>({scenarioCounts.created} created)</span>}
                    {scenarioCounts.updated > 0 && <span style={{ opacity: 0.85, fontSize: "11px", marginLeft: "4px" }}>({scenarioCounts.updated} updated)</span>}
                  </span>
                )}
                {scenarioCounts.validated > 0 && (
                  <span className="chip brand">🛡️ Validated: {scenarioCounts.validated}</span>
                )}
                {scenarioCounts.invalid > 0 && (
                  <span className="chip bad" style={{ background: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444" }}>
                    ⚠️ Quarantined Invalid: {scenarioCounts.invalid}
                  </span>
                )}
                {scenarioCounts.failed > 0 && (
                  <span className="chip bad">❌ Failed: {scenarioCounts.failed}</span>
                )}
              </div>

              {/* Dedicated Scenario Download Action Buttons (Excel UTF-8 BOM) */}
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  className="secondary sm"
                  onClick={() => onDownloadReport("full")}
                  title="Download complete audit report including all 27+ original source columns and Medplum URLs"
                  style={{ fontWeight: 600 }}
                >
                  📥 Full Audit CSV ({report.results?.length || 0})
                </button>
                <button
                  className="secondary sm"
                  onClick={() => onDownloadReport("quarantine")}
                  disabled={scenarioCounts.invalid === 0 && scenarioCounts.failed === 0}
                  title="Export only quarantined/invalid rows with field failure diagnostics for clinical remediation"
                  style={{
                    color: (scenarioCounts.invalid > 0 || scenarioCounts.failed > 0) ? "#ef4444" : "var(--muted)",
                    borderColor: (scenarioCounts.invalid > 0 || scenarioCounts.failed > 0) ? "rgba(239, 68, 68, 0.4)" : "var(--card-border)",
                    fontWeight: 600,
                  }}
                >
                  🚨 Quarantine Exceptions ({scenarioCounts.invalid + scenarioCounts.failed})
                </button>
                <button
                  className="secondary sm"
                  onClick={() => onDownloadReport("manifest")}
                  disabled={scenarioCounts.delivered === 0}
                  title="Export delivery manifest of successfully persisted Medplum resources"
                  style={{
                    color: scenarioCounts.delivered > 0 ? "var(--ok)" : "var(--muted)",
                    borderColor: scenarioCounts.delivered > 0 ? "rgba(16, 185, 129, 0.4)" : "var(--card-border)",
                    fontWeight: 600,
                  }}
                >
                  ✓ Delivery Manifest ({scenarioCounts.delivered})
                </button>
                <button
                  className="secondary sm"
                  onClick={onDownloadJSON}
                  title="Download complete JSON audit package"
                >
                  💾 JSON Bundle
                </button>
              </div>
            </div>
          </div>

          {/* High-Volume Search & Scenario Filter Bar */}
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
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                {[
                  { id: "ALL", label: `ALL (${scenarioCounts.ALL})` },
                  ...(scenarioCounts.delivered > 0 ? [{ id: "delivered", label: `Delivered (${scenarioCounts.delivered})` }] : []),
                  ...(scenarioCounts.created > 0 ? [{ id: "created", label: `✨ Created (${scenarioCounts.created})` }] : []),
                  ...(scenarioCounts.updated > 0 ? [{ id: "updated", label: `🔄 Updated (${scenarioCounts.updated})` }] : []),
                  ...(scenarioCounts.validated > 0 ? [{ id: "validated", label: `🛡️ Validated (${scenarioCounts.validated})` }] : []),
                  ...(scenarioCounts.invalid > 0 ? [{ id: "invalid", label: `⚠️ Quarantined (${scenarioCounts.invalid})` }] : []),
                  ...(scenarioCounts.failed > 0 ? [{ id: "failed", label: `❌ Failed (${scenarioCounts.failed})` }] : []),
                ].map((st) => (
                  <button
                    key={st.id}
                    className={`secondary sm ${statusFilter === st.id ? "active-pill" : ""}`}
                    style={{ fontSize: "11px", padding: "3px 8px" }}
                    onClick={() => {
                      setStatusFilter(st.id);
                      setCurrentPage(1);
                    }}
                  >
                    {st.label}
                  </button>
                ))}
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

          {/* Results Table */}
          <div style={{ overflowX: "auto", borderRadius: "var(--radius-sm)", border: "1px solid var(--card-border)" }}>
            <table style={{ margin: 0, fontSize: "12px" }}>
              <thead>
                <tr>
                  <th style={{ width: "5%" }}>#</th>
                  <th style={{ width: "18%" }}>Source Identifier</th>
                  <th style={{ width: "24%" }}>Clinical / Demographics</th>
                  <th style={{ width: "20%" }}>Target Medplum Link</th>
                  <th style={{ width: "15%" }}>Status</th>
                  <th style={{ width: "18%", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedResults.map((r, idx) => {
                  const i = (currentPage - 1) * pageSize + idx;
                  const s = r.patient_summary || {};
                  const m = r.mapping_details || {};
                  const deliveryAction = m.delivery_action;
                  const isInvalid = r.status === "invalid" || (r.errors && r.errors.length > 0);

                  return (
                    <tr
                      key={i}
                      style={{
                        background: isInvalid ? "rgba(239, 68, 68, 0.08)" : undefined,
                        borderLeft: isInvalid ? "4px solid #ef4444" : undefined,
                      }}
                    >
                      <td>{i + 1}</td>
                      <td>
                        <strong>{r.source_id}</strong>
                        <div className="sub-meta">Tag: {datasetName}</div>
                      </td>
                      <td>
                        <div style={{ color: isInvalid ? "var(--bad)" : "var(--brand)", fontWeight: 600 }}>{s.title || "Record"}</div>
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
                          <span className="sub-meta" style={{ fontStyle: "italic", color: "var(--ok)" }}>
                            ✓ Validated (Ready to commit)
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {r.status === "delivered" ? (
                          <span className="chip ok">
                            {deliveryAction === "created" ? "✨ created" : "🔄 updated"}
                          </span>
                        ) : r.status === "dry_run" ? (
                          <span className="chip brand">🛡️ validated</span>
                        ) : isInvalid ? (
                          <span className="chip bad" style={{ background: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444" }}>
                            ⚠️ quarantined
                          </span>
                        ) : (
                          <span className={`chip ${STATUS_CLASS[r.status] || ""}`}>{r.status}</span>
                        )}
                        {r.errors && r.errors.length > 0 && (
                          <div className="error" style={{ fontSize: "11px", marginTop: "4px" }}>
                            {formatHumanTableRowError(r.errors[0])}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                          <button className="secondary sm" onClick={() => onInspectRecord(r)} title="Inspect Record">
                            🔍
                          </button>
                          <button
                            className="secondary sm"
                            onClick={() => onStartEdit(i, r)}
                            title="Edit Record In-Place"
                            style={{ color: "#38bdf8", borderColor: "rgba(56, 189, 248, 0.4)" }}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            className="danger sm"
                            onClick={() => onDeleteRecord(i)}
                            title="Exclude from Batch"
                            style={{ padding: "3px 7px" }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

