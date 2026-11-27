import React, { useState, useEffect, useMemo } from "react";
import { Stethoscope, Sparkles, Plus, X, Save } from "lucide-react";
import { parseHumanDiagnostic, formatHumanTableRowError } from "@/utils/errorDiagnostics.js";
import AppDialog from "@/components/ui/Dialog.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import { cn } from "@/utils/cn.js";

export { parseHumanDiagnostic, formatHumanTableRowError };

const METADATA_KEYS = new Set([
  "#",
  "Original Row",
  "Error Classification",
  "Source Identifier",
  "Violations / Errors",
  "Remediation Guidance",
]);

export default function EditRecordModal({
  editingRow,
  editingError,
  headers = [],
  onClose,
  onSave,
}) {
  const [formData, setFormData] = useState({});
  const [initialSnapshot, setInitialSnapshot] = useState("{}");
  const [localError, setLocalError] = useState("");
  const [newFieldName, setNewFieldName] = useState("");
  const [showAddField, setShowAddField] = useState(false);

  useEffect(() => {
    if (editingRow) {
      const initial = { ...(editingRow.data || {}) };
      (headers || []).forEach((h) => {
        if (!(h in initial)) initial[h] = "";
      });
      setFormData(initial);
      setInitialSnapshot(JSON.stringify(initial));
      setLocalError(editingError || "");
      setNewFieldName("");
      setShowAddField(false);
    }
  }, [editingRow, editingError, headers]);

  const isDirty = useMemo(
    () => Boolean(editingRow) && JSON.stringify(formData) !== initialSnapshot,
    [editingRow, formData, initialSnapshot]
  );

  const activeDiagError =
    localError || (editingRow?.errors && editingRow.errors.length > 0 ? editingRow.errors[0] : null);
  const diagnostic = activeDiagError
    ? parseHumanDiagnostic(activeDiagError, formData, editingRow?.sourceId)
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

  const handleAddNewField = (e) => {
    e?.preventDefault();
    const trimmed = newFieldName.trim();
    if (!trimmed) return;
    setFormData((prev) => ({ ...prev, [trimmed]: prev[trimmed] ?? "" }));
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

  const formKeys = Object.keys(formData).filter((k) => !METADATA_KEYS.has(k));

  const footerErrorSummary = diagnostic
    ? `${diagnostic.col || diagnostic.field}: ${diagnostic.badValue ? `"${diagnostic.badValue}"` : diagnostic.title}`
    : activeDiagError || "";

  return (
    <AppDialog
      open={Boolean(editingRow)}
      onClose={onClose}
      dirty={isDirty}
      maxWidth="780px"
      title={
        editingRow ? (
          <span>
            In-Place Edit Record:{" "}
            <code className="text-[var(--brand)]">
              {editingRow.sourceId || `#${(editingRow.index ?? 0) + 1}`}
            </code>
          </span>
        ) : (
          "Edit Record"
        )
      }
      subtitle="Fix highlighted fields and re-validate"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 text-left">
            {footerErrorSummary && (
              <span
                role="status"
                title={diagnostic?.explanation || footerErrorSummary}
                className="inline-flex max-w-full items-center gap-1.5 truncate rounded-[var(--radius-sm)] border border-[var(--bad-border)] bg-[var(--bad-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--bad)]"
              >
                {footerErrorSummary}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="edit-record-form">
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              Save &amp; Re-Validate
            </Button>
          </div>
        </div>
      }
    >
      {editingRow && (
        <div className="space-y-4">
          {/* Clinical Validation Diagnostic Box */}
          {diagnostic && (
            <div
              role="alert"
              className="rounded-[var(--radius-md)] border border-[var(--bad-border)] bg-[var(--bad-bg)] p-4 space-y-2.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-[240px]">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--bad)]">
                    <Stethoscope className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Clinical Validation Notice: {diagnostic.title}</span>
                  </div>
                  <p className="m-0 text-xs leading-relaxed text-[var(--text-primary)]">
                    {diagnostic.explanation}
                  </p>
                </div>

                {diagnostic.suggestedFix && diagnostic.suggestedFix !== "YYYY-MM-DD" && (
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => handleApplyAutoFix(diagnostic.suggestedFix, diagnostic.col)}
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    Apply Fix: {diagnostic.suggestedFix}
                  </Button>
                )}
              </div>

              <div className="border-t border-[var(--bad-border)] pt-2 text-xs text-[var(--text-secondary)]">
                <strong className="text-[var(--text-primary)]">Remediation Steps:</strong>
                <ul className="m-0 mt-1 list-disc pl-4 space-y-0.5">
                  {diagnostic.aiInstructions.map((inst, idx) => (
                    <li key={idx}>{inst}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Field Count & Add Field Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[var(--text-muted)] tabular-nums">
              Record Attributes: <strong className="text-[var(--text-primary)]">{formKeys.length} Fields</strong>
            </span>

            {!showAddField ? (
              <Button size="sm" variant="secondary" onClick={() => setShowAddField(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add Field to Record
              </Button>
            ) : (
              <form onSubmit={handleAddNewField} className="flex items-center gap-1.5">
                <input
                  type="text"
                  aria-label="New field name"
                  placeholder="Field name (e.g. memid)"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  autoFocus
                  className="h-[30px] w-[180px] rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-xs"
                />
                <Button size="sm" variant="primary" type="submit" disabled={!newFieldName.trim()}>
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Cancel adding field"
                  onClick={() => setShowAddField(false)}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </form>
            )}
          </div>

          {/* Fields Form */}
          <form
            id="edit-record-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              onSave(formData);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {formKeys.map((col) => {
                const isErrCol = (editingRow.errors || []).some((err) =>
                  err.toLowerCase().includes(col.toLowerCase())
                ) || diagnostic?.col === col;
                const isMissing = !formData[col] && isErrCol;
                const inputId = `edit-field-${col}`;

                return (
                  <div
                    key={col}
                    className={cn(
                      "rounded-[var(--radius-sm)] border p-2.5 space-y-1.5",
                      isErrCol
                        ? "border-[var(--bad-border)] bg-[var(--bad-bg)]/50"
                        : "border-[var(--border-default)] bg-[var(--bg-subtle)]/50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <label
                          htmlFor={inputId}
                          className={cn(
                            "text-xs font-semibold font-mono",
                            isErrCol ? "text-[var(--bad)]" : "text-[var(--text-secondary)]"
                          )}
                        >
                          {col}
                        </label>
                        {isErrCol && (
                          <Badge tone="bad">{isMissing ? "Missing" : "Invalid"}</Badge>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove field ${col}`}
                        onClick={() => handleRemoveField(col)}
                        className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--bad)] cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    <input
                      id={inputId}
                      type="text"
                      aria-invalid={isErrCol ? "true" : undefined}
                      value={formData[col] ?? ""}
                      placeholder={`Enter ${col}…`}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, [col]: e.target.value }))
                      }
                      className={cn(
                        "h-[32px] w-full rounded-[var(--radius-sm)] border bg-[var(--bg-surface)] px-2.5 text-xs font-mono",
                        isErrCol ? "border-[var(--bad)]" : "border-[var(--border-default)]"
                      )}
                    />
                  </div>
                );
              })}
            </div>
          </form>
        </div>
      )}
    </AppDialog>
  );
}
