import React, { useState, useEffect, useMemo } from "react";
import { Plus, AlertCircle } from "lucide-react";
import AppDialog from "@/components/ui/Dialog.jsx";
import Button from "@/components/ui/Button.jsx";

export default function AddRecordModal({ isOpen, headers = [], onClose, onSave, error }) {
  const [formData, setFormData] = useState({});
  const [initialSnapshot, setInitialSnapshot] = useState("{}");

  useEffect(() => {
    if (isOpen) {
      const init = {};
      headers.forEach((h) => {
        init[h] = "";
      });
      setFormData(init);
      setInitialSnapshot(JSON.stringify(init));
    }
  }, [isOpen, headers]);

  const isDirty = useMemo(
    () => isOpen && JSON.stringify(formData) !== initialSnapshot,
    [isOpen, formData, initialSnapshot]
  );

  return (
    <AppDialog
      open={isOpen}
      onClose={onClose}
      dirty={isDirty}
      maxWidth="740px"
      title="Add New Record to Batch"
      subtitle="Enter source clinical or demographic attributes and validate in real time"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="add-record-form">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add &amp; Validate Record
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--bad-border)] bg-[var(--bad-bg)] px-3.5 py-2.5 text-xs font-medium text-[var(--bad)]"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>Validation Violation:</strong> {error}
            </span>
          </div>
        )}

        <form
          id="add-record-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onSave(formData);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {headers.map((col, idx) => {
              const id = `add-field-${col}`;
              return (
                <div key={col} className="space-y-1">
                  <label
                    htmlFor={id}
                    className="block font-mono text-xs font-semibold text-[var(--text-secondary)]"
                  >
                    {col}
                  </label>
                  <input
                    id={id}
                    type="text"
                    autoFocus={idx === 0}
                    value={formData[col] ?? ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, [col]: e.target.value }))
                    }
                    className="h-[34px] w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-xs font-mono"
                  />
                </div>
              );
            })}
          </div>
        </form>
      </div>
    </AppDialog>
  );
}
