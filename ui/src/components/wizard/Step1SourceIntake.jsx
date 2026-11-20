import React, { useRef, useState } from "react";

export default function Step1SourceIntake({
  fileData,
  datasetName,
  setDatasetName,
  targetResource,
  setTargetResource,
  onFileUpload,
  onLoadSample,
  onProceed,
  busy,
}) {
  const fileInputRef = useRef(null);
  const [showPreview, setShowPreview] = useState(true);

  return (
    <div className="wizard-step-pane">
      <div className="section-header-row">
        <div>
          <h3 className="section-title">Step 1: Data Source Intake &amp; Preview</h3>
          <p className="sub-meta">Upload a clinical spreadsheet, SQL export, EHR extract, or PlanData table</p>
        </div>
        <button className="secondary sm" onClick={onLoadSample} disabled={!!busy}>
          ⚡ Load Sample PlanData Table (memid, fullname, sex, dob...)
        </button>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        className="file-drop-zone"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => onFileUpload(e.target.files?.[0])}
          accept=".csv,.tsv,.json,.xlsx,.txt"
          style={{ display: "none" }}
        />
        <div className="drop-icon">📥</div>
        <div className="drop-main-text">
          Click to Browse or Drag &amp; Drop CSV, Excel (.xlsx), TSV, or JSON File
        </div>
        <div className="drop-sub-text">
          Supports SQL Server exports, PlanData tables, Excel spreadsheets (.xlsx), EHR extracts, or generic healthcare JSON feeds
        </div>

        {/* Supported Formats Pill Bar */}
        <div className="supported-formats-pills">
          <span className="format-pill">CSV (Comma/Semicolon)</span>
          <span className="format-pill">XLSX (Microsoft Excel)</span>
          <span className="format-pill">TSV (Tab-Separated)</span>
          <span className="format-pill">JSON / NDJSON</span>
        </div>
      </div>

      {/* Active File Loaded Information Card */}
      {fileData && (
        <div className="card loaded-file-card" style={{ marginTop: "18px" }}>
          <div className="row between" style={{ alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>📄</span>
                <strong>Loaded File:</strong> <code>{fileData.filename}</code>
                <span className="chip brand" style={{ fontWeight: 600 }}>{fileData.total_rows} Records</span>
                <span className="chip ok" style={{ fontWeight: 600 }}>{fileData.headers?.length || 0} Columns</span>
              </div>
            </div>

            <div className="row" style={{ margin: 0, gap: "10px", alignItems: "center" }}>
              <label style={{ margin: 0, fontSize: "12px" }}>
                Dataset Tag
                <input
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  style={{ width: "160px", padding: "5px 8px", fontSize: "12px", marginLeft: "6px" }}
                />
              </label>
              <label style={{ margin: 0, fontSize: "12px" }}>
                Target FHIR Resource
                <input
                  value={targetResource}
                  onChange={(e) => setTargetResource(e.target.value)}
                  style={{ width: "110px", padding: "5px 8px", fontSize: "12px", marginLeft: "6px" }}
                />
              </label>
            </div>
          </div>

          {/* Collapsible 3-Row Preview Drawer */}
          <div style={{ marginTop: "12px", borderTop: "1px solid var(--card-border)", paddingTop: "12px" }}>
            <div className="row between" style={{ marginBottom: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)" }}>
                Schema Preview (First 3 Rows):
              </span>
              <button
                className="secondary sm"
                onClick={() => setShowPreview(!showPreview)}
                style={{ fontSize: "11px", padding: "2px 8px" }}
              >
                {showPreview ? "Hide Preview ▲" : "Show Preview ▼"}
              </button>
            </div>

            {showPreview && fileData.sample_rows && fileData.sample_rows.length > 0 && (
              <div style={{ overflowX: "auto", maxHeight: "180px", borderRadius: "var(--radius-sm)", border: "1px solid var(--card-border)" }}>
                <table style={{ margin: 0, fontSize: "12px" }}>
                  <thead>
                    <tr>
                      {fileData.headers.map((h) => (
                        <th key={h} style={{ whiteSpace: "nowrap", padding: "6px 10px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fileData.sample_rows.slice(0, 3).map((row, i) => (
                      <tr key={i}>
                        {fileData.headers.map((h) => (
                          <td key={h} style={{ whiteSpace: "nowrap", padding: "5px 10px", color: row[h] ? "var(--text)" : "var(--muted)" }}>
                            {String(row[h] !== undefined && row[h] !== null && row[h] !== "" ? row[h] : "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Step 1 Completion Navigation Footer */}
          <div style={{ marginTop: "18px", display: "flex", justifyContent: "flex-end" }}>
            <button className="primary" onClick={onProceed}>
              Continue to Step 2: Mapping Contract →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

