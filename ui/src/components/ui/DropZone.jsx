import React, { useRef, useState } from "react";
import { UploadCloud, AlertCircle, FileSpreadsheet } from "lucide-react";
import { cn } from "@/utils/cn.js";

const ACCEPTED_EXTS = [".csv", ".tsv", ".json", ".xlsx", ".txt"];

export function DropZone({ onFileSelected, disabled = false, busy = false }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState("");

  const validateAndEmit = (file) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    const valid = ACCEPTED_EXTS.some((ext) => lower.endsWith(ext));
    if (!valid) {
      setLocalError(
        `Unsupported file "${file.name}". Please upload CSV, Excel (.xlsx), TSV, JSON, or TXT.`
      );
      return;
    }
    setLocalError("");
    onFileSelected?.(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !busy) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled || busy) return;
    const file = e.dataTransfer?.files?.[0];
    validateAndEmit(file);
  };

  return (
    <div className="space-y-2">
      <label
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 cursor-pointer",
          isDragging
            ? "border-[var(--brand)] bg-[var(--brand-bg)]"
            : "border-[var(--border-strong)] bg-[var(--bg-subtle)]/70 hover:border-[var(--brand)] hover:bg-[var(--brand-bg)]/40",
          (disabled || busy) && "opacity-60 cursor-wait"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.json,.xlsx,.txt"
          disabled={disabled || busy}
          onChange={(e) => {
            validateAndEmit(e.target.files?.[0]);
            e.target.value = "";
          }}
          className="sr-only"
        />

        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] text-[var(--brand)]">
          <UploadCloud className="h-6 w-6" aria-hidden="true" />
        </div>

        <div className="space-y-1">
          <div className="text-sm font-bold text-[var(--text-primary)]">
            {busy
              ? "Parsing file…"
              : isDragging
              ? "Release file to upload"
              : "Drop file here or browse"}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {["CSV", "XLSX", "TSV", "JSON"].map((fmt) => (
            <span
              key={fmt}
              className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden="true" />
              {fmt}
            </span>
          ))}
        </div>
      </label>

      {localError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--bad-border)] bg-[var(--bad-bg)] px-3 py-2 text-xs font-medium text-[var(--bad)]"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{localError}</span>
        </div>
      )}
    </div>
  );
}

export default DropZone;
