import React, { useState } from "react";
import MappingContractViewer from "../MappingContractViewer.jsx";

export default function Step2MappingContract({
  mapping,
  llmMetrics,
  targetResource,
  onSynthesize,
  onApprove,
  onProceed,
  busy,
  onEditRule,
  onDeleteRule,
  onAddRule,
}) {
  const [ruleSearch, setRuleSearch] = useState("");
  const [ruleFilter, setRuleFilter] = useState("ALL"); // "ALL" | "REQUIRED" | "OPTIONAL"
  const approved = mapping?.status === "approved";

  const rules = mapping?.rules || [];
  const filteredRules = rules.filter((r) => {
    if (ruleFilter === "REQUIRED" && !r.required) return false;
    if (ruleFilter === "OPTIONAL" && r.required) return false;
    if (ruleSearch.trim()) {
      const q = ruleSearch.toLowerCase();
      const matchSrc = String(r.source || "").toLowerCase().includes(q);
      const matchTgt = String(r.target || "").toLowerCase().includes(q);
      const matchTransform = String(r.transform || "").toLowerCase().includes(q);
      if (!matchSrc && !matchTgt && !matchTransform) return false;
    }
    return true;
  });

  return (
    <div className="wizard-step-pane">
      <div className="section-header-row">
        <div>
          <h3 className="section-title">Step 2: AI Mapping Contract &amp; Rules</h3>
          <p className="sub-meta">Review, customize, and approve the FHIR R4 transformation schema contract</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
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

      {/* Visual Contract Metrics Badge Card */}
      {mapping && (
        <MappingContractViewer
          mapping={mapping}
          llmMetrics={llmMetrics || mapping.metadata?.llm_metrics}
          recordsCount={rules.length}
          approved={approved}
          onApprove={onApprove}
        />
      )}

      {/* Rules Table with Search and Filtering */}
      {mapping && (
        <div className="card" style={{ marginTop: "16px" }}>
          <div className="row between" style={{ alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="text"
                placeholder="🔍 Search rules (source, target, transform)..."
                value={ruleSearch}
                onChange={(e) => setRuleSearch(e.target.value)}
                style={{ width: "240px", padding: "5px 10px", fontSize: "12px" }}
              />
              <button
                className={`secondary sm ${ruleFilter === "ALL" ? "active-pill" : ""}`}
                onClick={() => setRuleFilter("ALL")}
              >
                All ({rules.length})
              </button>
              <button
                className={`secondary sm ${ruleFilter === "REQUIRED" ? "active-pill" : ""}`}
                onClick={() => setRuleFilter("REQUIRED")}
              >
                Required ({rules.filter((r) => r.required).length})
              </button>
              <button
                className={`secondary sm ${ruleFilter === "OPTIONAL" ? "active-pill" : ""}`}
                onClick={() => setRuleFilter("OPTIONAL")}
              >
                Optional ({rules.filter((r) => !r.required).length})
              </button>
            </div>

            <button
              className="secondary sm"
              onClick={onAddRule}
              title="Add a custom mapping rule"
            >
              ➕ Add Custom Rule
            </button>
          </div>

          <div style={{ overflowX: "auto", maxHeight: "420px", borderRadius: "var(--radius-sm)", border: "1px solid var(--card-border)" }}>
            <table style={{ margin: 0, fontSize: "12px" }}>
              <thead>
                <tr>
                  <th style={{ width: "20%" }}>Source Field</th>
                  <th style={{ width: "30%" }}>Target FHIR Path</th>
                  <th style={{ width: "15%" }}>Transform</th>
                  <th style={{ width: "12%" }}>Confidence</th>
                  <th style={{ width: "10%" }}>Requirement</th>
                  <th style={{ width: "13%", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((rule, idx) => {
                  const actualIdx = rules.indexOf(rule);
                  return (
                    <tr key={actualIdx}>
                      <td>
                        <strong>{rule.source}</strong>
                      </td>
                      <td>
                        <code style={{ background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: "4px" }}>
                          {rule.target}
                        </code>
                      </td>
                      <td>
                        <span className="chip brand" style={{ fontSize: "11px" }}>
                          {rule.transform || "direct"}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: rule.confidence >= 0.9 ? "var(--ok)" : "var(--warn)", fontWeight: 600 }}>
                          {Math.round((rule.confidence || 0.85) * 100)}%
                        </span>
                      </td>
                      <td>
                        <span className={`chip ${rule.required ? "warn" : "info"}`} style={{ fontSize: "10px" }}>
                          {rule.required ? "Required" : "Optional"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <button
                            className="secondary sm"
                            onClick={() => onEditRule(actualIdx)}
                            title="Edit Rule"
                            style={{ padding: "2px 6px" }}
                          >
                            ✏️
                          </button>
                          <button
                            className="danger sm"
                            onClick={() => onDeleteRule(actualIdx)}
                            title="Delete Rule"
                            style={{ padding: "2px 6px" }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Navigation to Step 3 */}
          <div style={{ marginTop: "18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="sub-meta">
              {approved ? "✓ Contract is approved and ready for quality gate validation." : "⚠️ You can approve now or proceed to dry-run validation."}
            </span>
            <button className="primary" onClick={onProceed}>
              Continue to Step 3: Quality Gate &amp; Auto-Heal →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
