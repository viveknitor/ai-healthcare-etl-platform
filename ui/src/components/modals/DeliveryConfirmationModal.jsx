import React from "react";
import { ShieldCheck, AlertTriangle, Pencil, Send } from "lucide-react";
import AppDialog from "@/components/ui/Dialog.jsx";
import Button from "@/components/ui/Button.jsx";

export default function DeliveryConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  onReviewQuarantine,
  validCount,
  invalidCount,
  targetResource = "Patient",
  datasetName = "Dataset",
}) {
  return (
    <AppDialog
      open={isOpen}
      onClose={onClose}
      sheetOnMobile={false}
      maxWidth="580px"
      title="Confirm Medplum Ingestion & Delivery"
      subtitle={`HL7 FHIR R4 Destination: ${targetResource} • Batch: ${datasetName}`}
      footer={
        <>
          <Button variant="secondary" autoFocus onClick={onClose}>
            Cancel
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {invalidCount > 0 && onReviewQuarantine && (
              <Button variant="secondary" onClick={onReviewQuarantine}>
                <Pencil className="h-3.5 w-3.5 text-[var(--warn)]" aria-hidden="true" />
                Review &amp; Fix ({invalidCount})
              </Button>
            )}
            <Button variant="success" onClick={onConfirm}>
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {invalidCount > 0
                ? `Deliver ${validCount} Validated (Quarantine ${invalidCount})`
                : `Deliver All ${validCount} to Medplum`}
            </Button>
          </div>
        </>
      }
    >
      {invalidCount > 0 ? (
        <div className="space-y-4">
          <div className="rounded-[var(--radius-md)] border border-[var(--warn-border)] bg-[var(--warn-bg)] p-3.5 space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--warn)]">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Quality Gate Quarantine Protection</span>
            </div>
            <p className="m-0 text-xs leading-relaxed text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">{validCount}</strong> record(s) passed pre-flight FHIR R4 validation and will be upserted.{" "}
              <strong className="text-[var(--text-primary)]">{invalidCount}</strong> quarantined record(s) will{" "}
              <strong>not</strong> be sent to Medplum.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[var(--radius-md)] border border-[var(--ok-border)] bg-[var(--ok-bg)] p-3.5">
              <div className="text-xs font-bold uppercase tracking-wide text-[var(--ok)]">
                Delivering to Medplum
              </div>
              <div className="my-1 text-2xl font-bold tabular-nums text-[var(--ok)]">
                {validCount}
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                Idempotent conditional upsert.
              </div>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--bad-border)] bg-[var(--bad-bg)] p-3.5">
              <div className="text-xs font-bold uppercase tracking-wide text-[var(--bad)]">
                Quarantining
              </div>
              <div className="my-1 text-2xl font-bold tabular-nums text-[var(--bad)]">
                {invalidCount}
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                Held safely in review ledger.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2.5 py-4 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ok-border)] bg-[var(--ok-bg)] text-[var(--ok)]">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <h3 className="m-0 text-base font-bold text-[var(--text-primary)]">
            100% Quality Gate Cleared
          </h3>
          <p className="m-0 text-xs text-[var(--text-muted)] clinical-prose">
            All <strong className="tabular-nums text-[var(--text-primary)]">{validCount}</strong> records conform to official HL7 FHIR R4 constraints and are ready for Medplum delivery.
          </p>
        </div>
      )}
    </AppDialog>
  );
}
