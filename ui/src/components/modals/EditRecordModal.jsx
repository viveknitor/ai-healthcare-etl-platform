import React, { useState } from "react";

export function parseHumanDiagnostic(rawErr, rowData = {}) {
  if (!rawErr) return null;
  const str = String(rawErr);

  // 1. Date format error (e.g. birthDate; Value error, Date value string does not match spec regex. [input_value='1985-15-06'])
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

  // 2. DateTime missing timezone (e.g. deceasedDateTime)
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

  // 3. Choice type collision (e.g. multipleBirth)
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

  // 4. Transform syntax error
  if (str.includes("unknown transform")) {
    return {
      field: "mapping",
      col: null,
      title: "Transform Function Notice",
      explanation: str,
      badValue: "",
      suggestedFix: null,
      aiInstructions: [
        "1. Click 'AI Auto-Heal Contract with Gemini' on the main page.",
        "2. Or edit the field value to standard text.",
        "3. Re-test validation.",
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

export function formatHumanTableRowError(rawErr) {
  if (!rawErr) return "";
  const diag = parseHumanDiagnostic(rawErr);
  if (!diag) return String(rawErr);
  if (diag.badValue && diag.suggestedFix && diag.suggestedFix !== "YYYY-MM-DD") {
    return `⚠️ ${diag.field}: Invalid '${diag.badValue}'. AI Auto-Fix: '${diag.suggestedFix}'`;
  }
  return `⚠️ ${diag.title}: ${diag.explanation.slice(0, 110)}…`;
}

export default function EditRecordModal({
  editingRow,
  editingError,
  onClose,
  onSave,
}) {
  const [formData, setFormData] = useState(() => ({ ...(editingRow?.data || {}) }));
  const [localError, setLocalError] = useState(editingError || "");

  if (!editingRow) return null;

  const activeDiagError = localError || (editingRow.errors && editingRow.errors.length > 0 ? editingRow.errors[0] : null);
  const diagnostic = activeDiagError ? parseHumanDiagnostic(activeDiagError, formData) : null;

  const handleApplyAutoFix = (suggestedValue, targetCol) => {
    if (!suggestedValue) return;
    const colToUpdate =
      targetCol ||
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

  const handleSave = () => {
    onSave(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: "750px" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: "16px" }}>
              ✏️ In-Place Edit Record: <code>{editingRow.sourceId}</code>
            </h3>
            <span className="sub-meta">Remediate source data attributes and trigger live FHIR re-validation</span>
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
                  ✨ Apply Fix: '{diagnostic.suggestedFix}'
                </button>
              )}
            </div>

            {/* AI Step-by-Step Instructions */}
            <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px dashed rgba(255, 255, 255, 0.15)", fontSize: "11px" }}>
              <strong style={{ color: "#fcd34d", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                💡 AI Instructions to Save & Certify:
              </strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: "16px", color: "var(--text)" }}>
                {diagnostic.aiInstructions.map((inst, idx) => (
                  <li key={idx} style={{ marginTop: "2px" }}>{inst}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="modal-body" style={{ maxHeight: "55vh", overflowY: "auto", padding: "16px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {Object.keys(formData).map((col) => {
              const isErrCol = (editingRow.errors || []).some((err) =>
                err.toLowerCase().includes(col.toLowerCase())
              );
              return (
                <div key={col}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: isErrCol ? "var(--bad)" : "var(--muted)", marginBottom: "4px" }}>
                    {col} {isErrCol && "⚠️"}
                  </label>
                  <input
                    type="text"
                    value={formData[col] ?? ""}
                    onChange={(e) => setFormData({ ...formData, [col]: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "7px 10px",
                      fontSize: "12px",
                      borderColor: isErrCol ? "var(--bad)" : undefined,
                      background: isErrCol ? "rgba(239, 68, 68, 0.08)" : undefined,
                      borderRadius: "6px",
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-header" style={{ borderTop: "1px solid var(--card-border)", justifyContent: "flex-end", gap: "10px" }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleSave}>
            💾 Save & Re-Validate Record
          </button>
        </div>
      </div>
    </div>
  );
}
