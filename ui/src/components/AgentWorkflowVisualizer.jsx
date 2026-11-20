import { useState } from "react";

export default function AgentWorkflowVisualizer({
  currentStage = 1, // 1: Ingestion, 2: AI Synthesis, 3: Human Gate, 4: Validation, 5: Delivery, 6: Reconciliation
  llmMetrics = null,
  datasetName = "Upload",
  recordsCount = 0,
  approved = false,
  validated = false,
  delivered = false,
}) {
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Compute dynamic stage status
  let stage = 1;
  if (delivered) stage = 6;
  else if (validated) stage = 5;
  else if (approved) stage = 4;
  else if (llmMetrics) stage = 3;
  else if (recordsCount > 0) stage = 2;

  const STAGES = [
    {
      num: 1,
      id: "ingestion",
      icon: "🤖",
      agent: "Ingestion Agent",
      title: "Schema Discovery",
      desc: recordsCount > 0 ? `${recordsCount} rows extracted from ${datasetName}` : "Awaiting data stream",
      done: recordsCount > 0,
      active: stage === 1,
    },
    {
      num: 2,
      id: "synthesis",
      icon: "🧠",
      agent: "AI Architect",
      title: "Semantic Synthesis",
      desc: llmMetrics
        ? `${llmMetrics.model || "Gemini"} • ${llmMetrics.total_tokens || 0} tokens • ${llmMetrics.cost_formatted || "$0.00018"}`
        : "Gemini analyzing clinical semantics",
      done: !!llmMetrics || approved,
      active: stage === 2,
    },
    {
      num: 3,
      id: "human_gate",
      icon: "👤",
      agent: "Human-in-the-Loop",
      title: "Governance Review",
      desc: approved ? "Contract approved by operator" : "Pending human review & verification",
      done: approved,
      active: stage === 3,
      isGate: true,
    },
    {
      num: 4,
      id: "validation",
      icon: "🛡️",
      agent: "Validation Gate",
      title: "Pre-Flight Verification",
      desc: validated ? "100% FHIR R4 schema verified" : "Mandatory schema & type quality gate",
      done: validated,
      active: stage === 4,
    },
    {
      num: 5,
      id: "delivery",
      icon: "⚡",
      agent: "Delivery Agent",
      title: "Idempotent Ingestion",
      desc: delivered ? "Upserted to Medplum (:8103)" : "Ready for conditional upsert",
      done: delivered,
      active: stage === 5,
    },
    {
      num: 6,
      id: "reconciliation",
      icon: "📊",
      agent: "Audit Agent",
      title: "Reconciliation Proof",
      desc: delivered ? "Field lineage & proof certified" : "Awaiting batch delivery",
      done: delivered,
      active: stage === 6,
    },
  ];

  return (
    <div
      className="card"
      style={{
        background: "linear-gradient(135deg, rgba(17, 24, 39, 0.7) 0%, rgba(30, 41, 59, 0.6) 100%)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        padding: "16px 20px",
        marginBottom: "16px",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
      }}
    >
      <div className="row between" style={{ margin: "0 0 14px", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "18px" }}>🌐</span>
          <div>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, letterSpacing: "0.5px" }}>
              Autonomous Multi-Agent Pipeline &amp; Governance
            </h3>
            <p className="sub-meta" style={{ margin: "1px 0 0", fontSize: "11px" }}>
              Coordinated specialized agents executing ingestion with strict Human-in-the-Loop oversight.
            </p>
          </div>
        </div>

        {/* Live Active Status Pill */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {llmMetrics && (
            <span
              className="chip"
              style={{
                background: "rgba(16, 185, 129, 0.15)",
                color: "#10b981",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                fontSize: "11px",
              }}
              title={`Tokens: ${llmMetrics.prompt_tokens} in / ${llmMetrics.completion_tokens} out • Latency: ${llmMetrics.latency_ms}ms`}
            >
              💰 LLM Cost: {llmMetrics.cost_formatted || "$0.00018"} ({llmMetrics.total_tokens} tokens)
            </span>
          )}
          <span
            className="chip"
            style={{
              background: delivered
                ? "rgba(16, 185, 129, 0.2)"
                : validated
                ? "rgba(59, 130, 246, 0.2)"
                : approved
                ? "rgba(245, 158, 11, 0.2)"
                : "rgba(139, 92, 246, 0.2)",
              color: delivered ? "var(--ok)" : validated ? "#60a5fa" : approved ? "var(--warn)" : "#c084fc",
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            {delivered
              ? "✓ Batch Ingested"
              : validated
              ? "✓ Validated (Ready to Ingest)"
              : approved
              ? "⚡ Approved by Human"
              : "🤖 AI Autonomous Mode"}
          </span>
        </div>
      </div>

      {/* Stepper Pipeline Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: "10px",
          position: "relative",
        }}
      >
        {STAGES.map((s, idx) => {
          const isDone = s.done;
          const isActive = s.active && !isDone;

          return (
            <div
              key={s.id}
              style={{
                position: "relative",
                background: isDone
                  ? "rgba(16, 185, 129, 0.08)"
                  : isActive
                  ? "rgba(59, 130, 246, 0.12)"
                  : "rgba(0, 0, 0, 0.2)",
                border: isDone
                  ? "1px solid rgba(16, 185, 129, 0.3)"
                  : isActive
                  ? "1px solid rgba(59, 130, 246, 0.4)"
                  : "1px solid rgba(255, 255, 255, 0.05)",
                borderRadius: "var(--radius-md)",
                padding: "10px 10px 8px",
                transition: "all 0.3s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "4px",
                }}
              >
                <span style={{ fontSize: "16px" }}>{s.icon}</span>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: "10px",
                    background: isDone
                      ? "rgba(16, 185, 129, 0.2)"
                      : isActive
                      ? "rgba(59, 130, 246, 0.3)"
                      : "rgba(255, 255, 255, 0.05)",
                    color: isDone ? "#34d399" : isActive ? "#93c5fd" : "var(--text-muted)",
                  }}
                >
                  {isDone ? "✓ Done" : isActive ? "● Active" : `Step ${s.num}`}
                </span>
              </div>

              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: isDone ? "#e2e8f0" : isActive ? "#93c5fd" : "var(--text-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {s.title}
              </div>

              <div
                style={{
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                  lineHeight: "1.2",
                  height: "24px",
                  overflow: "hidden",
                }}
                title={s.desc}
              >
                {s.desc}
              </div>

              {s.isGate && (
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "9px",
                    fontWeight: 700,
                    color: approved ? "#34d399" : "#fbbf24",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {approved ? "✓ Gate Cleared" : "⏸ Review Gate"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

