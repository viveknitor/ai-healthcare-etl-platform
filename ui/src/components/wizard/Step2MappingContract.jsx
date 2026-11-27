import React from "react";
import { RefreshCw, CheckCircle2, ArrowRight, AlertTriangle } from "lucide-react";
import MappingContractViewer from "@/components/MappingContractViewer.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";

export default function Step2MappingContract({
  mapping,
  llmMetrics,
  allHeaders = [],
  mappedSources = new Set(),
  unmappedHeaders = [],
  onSynthesize,
  onApprove,
  onSaveContract,
  savingContract,
  onProceed,
  busy,
  onMapAllRemaining,
  onMapSingleExtension,
  onEditRule,
  onRemoveRule,
  onAddRule,
}) {
  const approved = mapping?.status === "approved";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-bold tracking-tight text-[var(--text-primary)]">
            Phase 2: Mapping Contract
          </h2>
          <p className="m-0 text-xs text-[var(--text-muted)]">
            Review and approve FHIR R4 rules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={busy === "suggest"}
            onClick={onSynthesize}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {busy === "suggest" ? "Reasoning…" : "Re-Synthesize"}
          </Button>

          {approved && (
            <Badge tone="ok" icon={CheckCircle2}>
              Approved
            </Badge>
          )}
        </div>
      </div>

      {!mapping ? (
        <EmptyState
          variant="first-run"
          title={busy === "suggest" ? "AI Architect is synthesizing your FHIR R4 contract…" : "No mapping contract synthesized yet"}
          description="Click Re-Synthesize Contract to inspect the sample payload and generate deterministic mapping rules."
          actionLabel={busy === "suggest" ? undefined : "Synthesize Mapping Contract"}
          onAction={onSynthesize}
        />
      ) : (
        <MappingContractViewer
          mapping={mapping}
          llmMetrics={llmMetrics || mapping.metadata?.llm_metrics}
          approved={approved}
          allHeaders={allHeaders}
          mappedSources={mappedSources}
          unmappedHeaders={unmappedHeaders}
          onMapAllRemaining={onMapAllRemaining}
          onMapSingleExtension={onMapSingleExtension}
          onEditRule={onEditRule}
          onRemoveRule={onRemoveRule}
          onAddRule={onAddRule}
          onSaveContract={onSaveContract}
          savingContract={savingContract}
        />
      )}

      {/* Governance Step Footer */}
      {mapping && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-4 shadow-[var(--shadow-sm)]">
          <div className="space-y-0.5 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
              {approved ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-[var(--ok)]" aria-hidden="true" />
                  <span>Contract Approved &amp; Certified for HL7 FHIR R4</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-[var(--warn)]" aria-hidden="true" />
                  <span>Human Approval Required Before Validation</span>
                </>
              )}
            </div>
            <div className="text-[var(--text-muted)] tabular-nums">
              {allHeaders.length > 0 &&
                `${mappedSources.size} of ${allHeaders.length} columns mapped (${Math.round(
                  (mappedSources.size / Math.max(1, allHeaders.length)) * 100
                )}% coverage).`}
            </div>
          </div>

          {approved ? (
            <Button variant="primary" onClick={onProceed}>
              <span>Next Step</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button variant="success" onClick={() => onApprove(true)}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>Approve &amp; Continue</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
