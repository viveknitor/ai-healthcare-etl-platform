import React from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Search,
  Wrench,
  Send,
  ArrowRight,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import { cn } from "@/utils/cn.js";

const HEAL_STAGES = [
  { num: 1, title: "1. Errors", desc: "Capture traces" },
  { num: 2, title: "2. Diagnose", desc: "FHIR R4 root cause" },
  { num: 3, title: "3. Patch", desc: "Repair transforms" },
  { num: 4, title: "4. Re-Check", desc: "Re-test batch" },
];

export default function Step3QualityGate({
  fileData,
  report,
  isValidated,
  busy,
  healingTrack,
  healedChanges,
  llmMetrics,
  onRunValidation,
  onTriggerAutoHeal,
  onInitiateDelivery,
  onProceed,
  onViewInvalid,
}) {
  const invalidCount = report?.summary?.counts?.invalid || 0;
  const totalCount = report?.summary?.total || fileData?.total_rows || 0;
  const validCount = Math.max(0, totalCount - invalidCount);
  const hasValidationErrors = invalidCount > 0;
  const is100PercentValid = (isValidated || Boolean(report)) && invalidCount === 0;

  return (
    <div className="space-y-4">
      {/* Header & Primary Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-bold tracking-tight text-[var(--text-primary)]">
            Phase 3: Quality Gate
          </h2>
          <p className="m-0 text-xs text-[var(--text-muted)]">
            Dry-run FHIR R4 schema check.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            loading={busy === "validate"}
            disabled={Boolean(busy) && busy !== "validate"}
            onClick={onRunValidation}
          >
            {busy !== "validate" && <ShieldCheck className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" />}
            {busy === "validate"
              ? "Validating…"
              : report
              ? `Re-Validate (${totalCount})`
              : `Validate (${fileData?.total_rows || 0})`}
          </Button>

          {report && onInitiateDelivery && (
            <Button
              variant="success"
              disabled={Boolean(busy) || validCount === 0}
              onClick={onInitiateDelivery}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {invalidCount > 0
                ? `Deliver ${validCount} Valid`
                : `Deliver (${validCount})`}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Status Banner */}
      {!hasValidationErrors && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border px-5 py-4 shadow-[var(--shadow-sm)]",
            is100PercentValid
              ? "border-[var(--ok-border)] bg-[var(--ok-bg)]"
              : "border-[var(--border-default)] bg-[var(--bg-surface)]"
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                is100PercentValid
                  ? "border-[var(--ok-border)] bg-[var(--bg-surface)] text-[var(--ok)]"
                  : "border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--brand)]"
              )}
            >
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <strong className="block text-sm text-[var(--text-primary)]">
                {is100PercentValid
                  ? `All ${totalCount} records valid`
                  : "Ready to validate"}
              </strong>
              <span className="text-xs text-[var(--text-muted)]">
                {is100PercentValid
                  ? "Zero HL7 FHIR R4 schema violations."
                  : "Run Validate to check all rows before delivery."}
              </span>
            </div>
          </div>

          {is100PercentValid && (
            <Badge tone="ok" icon={CheckCircle2}>
              100% Validated ({totalCount})
            </Badge>
          )}
        </div>
      )}

      {/* Violations Banner */}
      {hasValidationErrors && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--bad-border)] bg-[var(--bad-bg)] px-5 py-4"
        >
          <div className="space-y-1 max-w-xl">
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[var(--bad)]">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Schema Violations Detected</span>
              <Badge tone="bad">{invalidCount} Records Quarantined</Badge>
            </div>
            <p className="m-0 text-xs leading-relaxed text-[var(--text-secondary)]">
              Quarantined records are isolated safely from Medplum. Trigger AI Auto-Heal to repair contract rules or inspect individual rows for manual remediation.
            </p>
            {healedChanges.length > 0 && (
              <p className="m-0 text-xs font-medium text-[var(--warn)]">
                Auto-heal already ran once. Remaining invalid rows likely reflect source data issues (fixable via Edit Record).
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="danger" onClick={onViewInvalid}>
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              View Quarantined ({invalidCount})
            </Button>

            <Button
              size="sm"
              variant="primary"
              loading={busy === "healing"}
              disabled={Boolean(busy) && busy !== "healing"}
              onClick={onTriggerAutoHeal}
            >
              {busy !== "healing" && <Wrench className="h-3.5 w-3.5" aria-hidden="true" />}
              {busy === "healing"
                ? "Healing Schema…"
                : healedChanges.length > 0
                ? `Re-Run Auto-Heal (${invalidCount})`
                : "AI Auto-Heal Contract"}
            </Button>
          </div>
        </div>
      )}

      {/* Active AI Self-Healing Tracker */}
      {(busy === "healing" || healingTrack.active) && (
        <div
          aria-live="polite"
          className="rounded-[var(--radius-lg)] border border-[var(--ai-border)] bg-[var(--ai-bg)] p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--ai)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>AI Closed-Loop Self-Healing Agent Active</span>
            </div>
            <Badge tone="ai">Analyzing {healingTrack.errorsTotal || invalidCount} Error Trace(s)</Badge>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            {HEAL_STAGES.map((st) => {
              const reached = healingTrack.step >= st.num;
              const current = healingTrack.step === st.num;
              return (
                <div
                  key={st.num}
                  className={cn(
                    "rounded-[var(--radius-sm)] border p-2.5",
                    current
                      ? "border-[var(--ai)] bg-[var(--bg-surface)]"
                      : reached
                      ? "border-[var(--ok-border)] bg-[var(--ok-bg)]"
                      : "border-[var(--border-default)] bg-[var(--bg-surface)] opacity-60"
                  )}
                >
                  <div className="font-bold text-[var(--text-primary)]">{st.title}</div>
                  <div className="text-[var(--text-muted)]">{st.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Self-Healing Audit Report */}
      {healedChanges.length > 0 && !busy && (
        <div
          className={cn(
            "rounded-[var(--radius-lg)] border p-5 space-y-3.5",
            invalidCount === 0
              ? "border-[var(--ok-border)] bg-[var(--ok-bg)]/60"
              : "border-[var(--warn-border)] bg-[var(--warn-bg)]/60"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <CheckCircle2
                className={cn("h-4 w-4", invalidCount === 0 ? "text-[var(--ok)]" : "text-[var(--warn)]")}
                aria-hidden="true"
              />
              <span>
                {invalidCount === 0
                  ? "AI Closed-Loop Self-Healing Certified — 100% Quality Gate Cleared"
                  : `Contract Repaired (${healedChanges.length} rules); ${invalidCount} data anomaly(ies) quarantined`}
              </span>
            </div>
            <Badge tone={invalidCount === 0 ? "ok" : "warn"}>
              {invalidCount === 0
                ? "0 Violations Remaining"
                : `${validCount} Validated • ${invalidCount} Quarantined`}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
              <div className="text-[var(--text-muted)] font-semibold">Rules Repaired</div>
              <div className="mt-1 text-base font-bold tabular-nums text-[var(--ok)]">
                {healedChanges.length} Rules
              </div>
            </div>
            <div className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
              <div className="text-[var(--text-muted)] font-semibold">Quarantined Rows</div>
              <div
                className={cn(
                  "mt-1 text-base font-bold tabular-nums",
                  invalidCount > 0 ? "text-[var(--bad)]" : "text-[var(--ok)]"
                )}
              >
                {invalidCount} Records
              </div>
            </div>
            <div className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
              <div className="text-[var(--text-muted)] font-semibold">AI Model</div>
              <div className="mt-1 truncate text-sm font-bold font-mono text-[var(--ai)]">
                {healingTrack.model || llmMetrics?.model || "gemini-flash-lite"}
              </div>
            </div>
            <div className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
              <div className="text-[var(--text-muted)] font-semibold">Cost &amp; Latency</div>
              <div className="mt-1 text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {healingTrack.costFormatted || llmMetrics?.cost_formatted || "$0.00025"} •{" "}
                {healingTrack.latencyMs || llmMetrics?.latency_ms || 1200}ms
              </div>
            </div>
          </div>

          <div className="space-y-1 text-xs">
            <div className="font-semibold text-[var(--text-secondary)]">
              Audit Log ({healedChanges.length} modifications):
            </div>
            <ul className="m-0 list-disc pl-5 space-y-1">
              {healedChanges.map((c, idx) => (
                <li key={idx}>
                  <code className="rounded border border-[var(--border-default)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-xs">
                    {c}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="text-xs">
          {hasValidationErrors && (
            <span className="font-medium text-[var(--warn)]">
              {validCount} validated records ready for Medplum; {invalidCount} quarantined records will be held safely.
            </span>
          )}
          {is100PercentValid && (
            <span className="font-medium text-[var(--ok)]">
              All {totalCount} records certified and ready for live Medplum delivery.
            </span>
          )}
        </div>

        <Button
          variant="primary"
          disabled={!report && !isValidated}
          onClick={onProceed}
        >
          <span>Next Step</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
