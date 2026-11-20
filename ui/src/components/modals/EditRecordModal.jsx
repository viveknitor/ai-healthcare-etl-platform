import React, { useState, useEffect } from "react";

export function parseHumanDiagnostic(rawErr, rowData = {}, sourceId = "") {
  if (!rawErr) return null;
  const str = String(rawErr);

  // 1. Missing required source field (e.g. missing required source field 'memid')
  if (str.includes("missing required source field") || str.includes("missing required field")) {
    const match = str.match(/'([^']+)'/);
    const missingCol = match ? match[1] : "memid";
    const suggested = sourceId && sourceId !== "—" ? sourceId : `MEM-${Date.now().toString().slice(-6)}`;
    return {
      field: missingCol,
      col: missingCol,
      title: `Missing Required Field: '${missingCol}'`,
      explanation: `The mapping contract requires field '${missingCol}' to generate a valid FHIR R4 resource, but this record is missing '${missingCol}'.`,
      badValue: "Missing / Null",
      suggestedFix: suggested,
      aiInstructions: [
        `1. Click the '✨ Add & Populate ${missingCol}' button below to apply '${suggested}'.`,
        `2. Or enter a unique ID in the '${missingCol}' input field below.`,
        "3. Click '💾 Save & Re-Validate Record' to certify the record.",
      ],
    };
  }

  // 2. Boolean mapping lookup error (e.g. 'issubscriber' -> 'extension[11].valueBoolean' (map): no mapping for value 'Y'/'N')
  if (str.includes("no mapping for value")) {
    const matchVal = str.match(/no mapping for value '([^']+)'/);
    const badVal = matchVal ? matchVal[1] : "";
    const colMatch = str.match(/'([^']+)'\s*->/);
    const col = colMatch ? colMatch[1] : "issubscriber";
    let suggested = null;
    const upper = badVal.toUpperCase();
    if (upper === "Y" || upper === "1" || upper === "TRUE") suggested = "true";
    if (upper === "N" || upper === "0" || upper === "FALSE") suggested = "false";

    return {
      field: col,
      col: col,
      title: `Boolean Code Mapping Notice (${col})`,
      explanation: `The mapping rule for '${col}' has transform 'map' without dictionary lookup rules for '${badVal}'. FHIR R4 booleans expect 'true' or 'false'.`,
      badValue: badVal,
      suggestedFix: suggested,
      aiInstructions: [
        suggested
          ? `1. Click '✨ Apply Fix: '${suggested}'' below to normalize '${badVal}' to '${suggested}'.`
          : `1. Change value to 'true' or 'false'.`,
        "2. Or in Step 2: change transform to 'direct' so FHIR boolean coercion handles 'Y'/'N' automatically.",
        "3. Click '💾 Save & Re-Validate Record'.",
      ],
    };
  }

  // 3. Date format error (e.g. birthDate; Value error, Date value string does not match spec regex. [input_value='1985-15-06'])
  if (str.includes("birthDate") || (str.includes("Date value") && str.includes("regex"))) {
    const valMatch = str.match(/input_value='([^']+)'/);
    const badVal = valMatch ? valMatch[1] : "";

    // Check if swapped YYYY-DD-MM (e.g. 1985-15-06)
    const swapMatch = badVal.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    let suggestion = null;
    let explanation = `The date '${badVal}' does not match standard FHIR R4 format (YYYY-MM-DD). Month must be between 01 and 12.`;

    if (swapMatch) {
      const y = swapMatch[1];
      const p1 = parseInt(swapMatch[2], 10);
      const p2 = parseInt(swapMatch[3], 10);
      if (p1 > 12 && p2 <= 12) {
        suggestion = `${y}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
        explanation = `The month and day are swapped ('${badVal}'). In FHIR R4, month '${p1}' is invalid because months only go up to 12. Swapping month and day yields '${suggestion}' (June 15, ${y}).`;
      }
    }

    const matchingCol = Object.keys(rowData).find(
      (k) =>
        rowData[k] === badVal ||
        k.toLowerCase() === "dob" ||
        k.toLowerCase().includes("birthdate") ||
        k.toLowerCase().includes("date")
    );

    return {
      field: "birthDate",
      col: matchingCol || "dob",
      title: "Date of Birth Format Violation",
      explanation: explanation,
      badValue: badVal,
      suggestedFix: suggestion || "YYYY-MM-DD",
      aiInstructions: [
        `1. Check the date value '${badVal}' in the '${matchingCol || "dob"}' field.`,
        suggestion
          ? `2. Swap month and day: click the button below to apply '${suggestion}'.`
          : "2. Ensure the format is strictly YYYY-MM-DD (e.g. 1985-06-15).",
        "3. Click '💾 Save & Re-Validate Record' to certify and promote the record to validated.",
      ],
    };
  }

  // 4. DateTime missing timezone (e.g. deceasedDateTime)
  if (str.includes("deceasedDateTime") || str.includes("DateTime value")) {
    const valMatch = str.match(/input_value='([^']+)'/);
    const badVal = valMatch ? valMatch[1] : "";
    const cleanDate = badVal.split("T")[0];
    const suggestion = cleanDate || "YYYY-MM-DD";

    const matchingCol = Object.keys(rowData).find(
      (k) =>
        rowData[k] === badVal ||
        k.toLowerCase().includes("death") ||
        k.toLowerCase().includes("date")
    );

    return {
      field: "deceasedDateTime",
      col: matchingCol || "deathdate",
      title: "DateTime Format Notice (Missing Timezone)",
      explanation: `FHIR R4 dateTime requires an explicit UTC timezone offset ('Z' or '+00:00') if time is specified, or a clean date (YYYY-MM-DD). Value '${badVal}' has no timezone.`,
      badValue: badVal,
      suggestedFix: suggestion,
      aiInstructions: [
        `1. Format date as clean '${suggestion}' (without naive midnight time).`,
        `2. Or append 'Z' for UTC offset: '${badVal ? badVal + "Z" : "YYYY-MM-DDTHH:MM:SSZ"}'.`,
        "3. Click '💾 Save & Re-Validate Record'.",
      ],
    };
  }

  // 5. Choice type collision (e.g. multipleBirth)
  if (str.includes("Any of one field value is expected from this list")) {
    return {
      field: "multipleBirth",
      col: "multiplebirth",
      title: "Conflicting Choice Attributes",
      explanation: "FHIR R4 choice elements allow only one variant (e.g. multipleBirthBoolean OR multipleBirthInteger), not both.",
      badValue: "Multiple choice types present",
      suggestedFix: "true",
      aiInstructions: [
        "1. Keep multipleBirthBoolean as a boolean true/false.",
        "2. Clear integer counts or move them to an extension.",
        "3. Click '💾 Save & Re-Validate Record'.",
      ],
    };
  }

  // Fallback
  const cleanMsg = str.replace(/https:\/\/errors\.pydantic\.dev[^\s]*/g, "").trim();
  return {
    field: "general",
    col: null,
    title: "Validation Violation",
    explanation: cleanMsg,
    badValue: "",
    suggestedFix: null,
    aiInstructions: [
      "1. Verify field value against FHIR R4 schema constraints.",
      "2. Correct any misformatted numbers, dates, or invalid enum codes.",
      "3. Click '💾 Save & Re-Validate Record'.",
    ],
  };
}

export function formatHumanTableRowError(rawErr, sourceId = "") {
  if (!rawErr) return "";
  const diag = parseHumanDiagnostic(rawErr, {}, sourceId);
  if (!diag) return String(rawErr);
  if (diag.suggestedFix && diag.suggestedFix !== "YYYY-MM-DD") {
    return `⚠️ ${diag.field}: ${diag.title}. AI Auto-Fix: '${diag.suggestedFix}'`;
  }
  return `⚠️ ${diag.title}: ${diag.explanation.slice(0, 110)}…`;
}

export default function EditRecordModal({
  editingRow,
  editingError,
  headers = [],
  onClose,
  onSave,
}) {
  const [formData, setFormData] = useState({});
  const [localError, setLocalError] = useState("");
  const [newFieldName, setNewFieldName] = useState("");
  const [showAddField, setShowAddField] = useState(false);

  // Synchronize form fields whenever a row is selected for editing
  useEffect(() => {
    if (editingRow) {
      const initial = { ...(editingRow.data || {}) };
      // Include any columns from the dataset headers so missing fields are visible as inputs
      (headers || []).forEach((h) => {
        if (!(h in initial)) {
          initial[h] = "";
        }
      });
      setFormData(initial);
      setLocalError(editingError || "");
      setNewFieldName("");
      setShowAddField(false);
    }
  }, [editingRow, editingError, headers]);

  if (!editingRow) return null;

  const activeDiagError =
    localError || (editingRow.errors && editingRow.errors.length > 0 ? editingRow.errors[0] : null);
  const diagnostic = activeDiagError
    ? parseHumanDiagnostic(activeDiagError, formData, editingRow.sourceId)
    : null;

  const handleApplyAutoFix = (suggestedValue, targetCol) => {
    if (!suggestedValue) return;
    const colToUpdate =
      targetCol ||
      diagnostic?.col ||
      Object.keys(formData).find(
        (k) =>
          k.toLowerCase() === "dob" ||
          k.toLowerCase().includes("date") ||
          formData[k] === diagnostic?.badValue
      );
    if (colToUpdate) {
      setFormData((prev) => ({ ...prev, [colToUpdate]: suggestedValue }));
      setLocalError("");
    }
  };

  const handleAddNewField = () => {
    const trimmed = newFieldName.trim();
    if (!trimmed) return;
    setFormData((prev) => ({ ...prev, [trimmed]: "" }));
    setNewFieldName("");
    setShowAddField(false);
  };

  const handleRemoveField = (colName) => {
    setFormData((prev) => {
      const copy = { ...prev };
      delete copy[colName];
      return copy;
    });
  };

  const handleSave = () => {
    onSave(formData);
  };

  const formKeys = Object.keys(formData);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: "780px" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>✏️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px" }}>
                In-Place Edit Record: <code>{editingRow.sourceId || `#${(editingRow.index ?? 0) + 1}`}</code>
              </h3>
              <span className="sub-meta">Remediate source data attributes and trigger live FHIR re-validation</span>
            </div>
          </div>
          <button className="secondary sm" onClick={onClose}>✕ Close</button>
        </div>

        {/* AI Human-Readable Diagnostic Assistant */}
        {diagnostic && (
          <div
            style={{
              margin: "14px 20px 0",
              padding: "14px 16px",
              background: "linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(245, 158, 11, 0.12) 100%)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "260px" }}>
                <div style={{ color: "#f87171", fontWeight: 700, fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>🩺 Clinical Validation Notice:</span>
                  <span>{diagnostic.title}</span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--text)", lineHeight: 1.5 }}>
                  {diagnostic.explanation}
                </p>
              </div>
              {diagnostic.suggestedFix && diagnostic.suggestedFix !== "YYYY-MM-DD" && (
                <button
                  className="primary sm"
                  onClick={() => handleApplyAutoFix(diagnostic.suggestedFix, diagnostic.col)}
                  style={{
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    borderColor: "rgba(16, 185, 129, 0.5)",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
                  }}
                  title={`Click to automatically apply ${diagnostic.suggestedFix} to ${diagnostic.col}`}
                >
                  ✨ Apply Fix: &apos;{diagnostic.suggestedFix}&apos;
                </button>
              )}
            </div>

            {/* AI Step-by-Step Instructions */}
            <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px dashed rgba(255, 255, 255, 0.15)", fontSize: "11px" }}>
              <strong style={{ color: "#fcd34d", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                💡 AI Instructions to Save &amp; Certify:
              </strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: "16px", color: "var(--text)" }}>
                {diagnostic.aiInstructions.map((inst, idx) => (
                  <li key={idx} style={{ marginTop: "2px" }}>{inst}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Toolbar: Record Field Count & Add Field Action */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 20px 0",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            Record Attributes: <strong>{formKeys.length} Fields</strong>
          </span>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {!showAddField ? (
              <button
                className="secondary sm"
                onClick={() => setShowAddField(true)}
                style={{ fontSize: "11px", padding: "4px 10px" }}
              >
                ➕ Add Field to Record
              </button>
            ) : (
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="Field name (e.g. memid, ssn)..."
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddNewField();
                    if (e.key === "Escape") setShowAddField(false);
                  }}
                  autoFocus
                  style={{ padding: "4px 8px", fontSize: "12px", width: "180px" }}
                />
                <button
                  className="primary sm"
                  onClick={handleAddNewField}
                  disabled={!newFieldName.trim()}
                  style={{ fontSize: "11px", padding: "4px 8px" }}
                >
                  Add
                </button>
                <button
                  className="secondary sm"
                  onClick={() => setShowAddField(false)}
                  style={{ fontSize: "11px", padding: "4px 6px" }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Form Fields Grid */}
        <div className="modal-body" style={{ maxHeight: "55vh", overflowY: "auto", padding: "12px 20px 20px" }}>
          {formKeys.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>
              No fields found in this record. Click &ldquo;➕ Add Field to Record&rdquo; above to add fields.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {formKeys.map((col) => {
                const isErrCol = (editingRow.errors || []).some((err) =>
                  err.toLowerCase().includes(col.toLowerCase())
                );
                const isMissing = !formData[col] && isErrCol;

                return (
                  <div
                    key={col}
                    style={{
                      position: "relative",
                      background: isErrCol ? "rgba(239, 68, 68, 0.05)" : "rgba(255, 255, 255, 0.02)",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: isErrCol ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid rgba(255, 255, 255, 0.05)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <label
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: isErrCol ? "#f87171" : "var(--muted)",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span>{col}</span>
                        {isErrCol && (
                          <span
                            className="chip bad"
                            style={{ fontSize: "9px", padding: "1px 4px", fontWeight: 700 }}
                          >
                            {isMissing ? "⚠️ Missing Field" : "⚠️ Error"}
                          </span>
                        )}
                      </label>

                      <button
                        className="secondary sm"
                        onClick={() => handleRemoveField(col)}
                        title={`Remove field '${col}'`}
                        style={{
                          padding: "1px 4px",
                          fontSize: "10px",
                          color: "var(--muted)",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                    </div>

                    <input
                      type="text"
                      value={formData[col] ?? ""}
                      placeholder={`Enter ${col}...`}
                      onChange={(e) => setFormData({ ...formData, [col]: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "12px",
                        borderColor: isErrCol ? "rgba(239, 68, 68, 0.6)" : undefined,
                        background: isErrCol ? "rgba(239, 68, 68, 0.1)" : undefined,
                        borderRadius: "4px",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-header" style={{ borderTop: "1px solid var(--card-border)", justifyContent: "flex-end", gap: "10px" }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleSave}>
            💾 Save &amp; Re-Validate Record
          </button>
        </div>
      </div>
    </div>
  );
}
