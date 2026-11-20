import React from "react";
import MappingContractViewer from "../MappingContractViewer.jsx";

export default function Step2MappingContract({
  mapping,
  llmMetrics,
  targetResource,
  allHeaders = [],
  mappedSources = new Set(),
  unmappedHeaders = [],
  onSynthesize,
  onApprove,
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
    <div className="wizard-step-pane">
      <div className="section-header-row">
        <div>
          <h3 className="section-title">Step 2: AI Mapping Contract &amp; Schema Coverage</h3>
          <p className="sub-meta">
            Review, map source columns, and approve the FHIR R4 transformation schema contract
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button className="secondary sm" onClick={onSynthesize} disabled={!!busy}>
            {busy === "suggest" ? "🤖 AI Reasoning…" : "🔄 Re-Synthesize Contract"}
          </button>
          {!approved && (
            <button className="primary sm" onClick={onApprove} disabled={!!busy}>
              ✓ Approve &amp; Lock Contract
            </button>
          )}
          {approved && (
            <span className="chip ok" style={{ fontSize: "12px", padding: "6px 12px" }}>
              ✓ Contract Approved
            </span>
          )}
        </div>
      </div>

      {/* Unified Interactive Contract Viewer with Coverage Bar, Search, and Lineage/JSON Modes */}
      {mapping && (
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
        />
      )}

      {/* Step Navigation Bar */}
      <div
        className="card"
        style={{
          marginTop: "16px",
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div>
          <strong style={{ fontSize: "13px", display: "block" }}>
            {approved
              ? "✓ Contract Approved & Certified for HL7 FHIR R4"
              : unmappedHeaders.length > 0
              ? `⚠️ ${unmappedHeaders.length} source column(s) unmapped. Map all remaining or proceed.`
              : "Ready for Pre-Flight Validation"}
          </strong>
          <span className="sub-meta">
            {allHeaders.length > 0 && `${mappedSources.size} of ${allHeaders.length} columns mapped (${Math.round((mappedSources.size / Math.max(1, allHeaders.length)) * 100)}% coverage).`}
          </span>
        </div>

        <button className="primary" onClick={onProceed}>
          Continue to Step 3: Quality Gate &amp; Auto-Heal →
        </button>
      </div>
    </div>
  );
}
