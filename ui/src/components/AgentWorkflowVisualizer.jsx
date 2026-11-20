import { useState } from "react";

export default function AgentWorkflowVisualizer({
  currentStage = 1,
  llmMetrics = null,
  datasetName = "Upload",
  recordsCount = 0,
  approved = false,
  validated = false,
  delivered = false,
  healingHistory = [],
}) {
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [viewMode, setViewMode] = useState("relay"); // "relay" | "matrix"

  // Compute dynamic stage status
  let stage = 1;
  if (delivered) stage = 6;
  else if (validated) stage = 5;
  else if (approved) stage = 4;
  else if (llmMetrics) stage = 3;
  else if (recordsCount > 0) stage = 2;

  const AGENTS = [
    {
      num: 1,
      id: "agent_1_extraction",
      codename: "DataScout Agent",
      archetype: "Extraction & Discovery",
      icon: "🤖",
      engine: "Python Streaming & XML/CSV Engine",
      mission:
        "Connects to arbitrary databases, Excel workbooks (.xlsx), CSV, TSV, or JSON feeds. Discovers headers, validates encodings, extracts de-identified sample records, and identifies primary keys.",
      inputReceived: `Raw data file / stream "${datasetName}" (${recordsCount || 0} rows)`,
      action: "Scans raw byte streams, parses tabular columns, normalizes headers, and strips invalid characters.",
      handoffOutput: "Discovered Schema & Sample Payload",
      passesTo: "AI Architect (Agent 2)",
      done: recordsCount > 0,
      active: stage === 1,
      status: recordsCount > 0 ? "Done" : "Waiting for Data",
      metrics: `${recordsCount || 0} rows extracted`,
    },
    {
      num: 2,
      id: "agent_2_synthesis",
      codename: "AI Architect",
      archetype: "Semantic Reasoning",
      icon: "🧠",
      engine: llmMetrics?.model || "Gemini 2.5 Flash",
      mission:
        "Analyzes proprietary and clinical field names against the official HL7 FHIR R4 standard. Synthesizes field mappings, deterministic transforms (date, map, trim), and SDoH extensions.",
      inputReceived: "Discovered Schema & De-identified Sample Record from Agent 1 (DataScout)",
      action:
        "Executes clinical semantic reasoning, maps proprietary concepts to standard FHIR paths, and calculates confidence scores.",
      handoffOutput: "Draft FHIR R4 Mapping Contract (MappingConfig)",
      passesTo: "Compliance Officer (Agent 3)",
      done: !!llmMetrics || approved,
      active: stage === 2,
      status: approved || llmMetrics ? "Done" : stage === 2 ? "Synthesizing…" : "Pending",
      metrics: llmMetrics
        ? `${llmMetrics.total_tokens || 0} tokens • ${llmMetrics.cost_formatted || "$0.00018"} • ${llmMetrics.latency_ms || 0}ms`
        : "Awaiting input from Agent 1",
    },
    {
      num: 3,
      id: "agent_3_governance",
      codename: "Compliance Officer",
      archetype: "Human-in-the-Loop Governance",
      icon: "👤",
      engine: "Human Operator Verification Gate",
      mission:
        "Guarantees regulatory compliance and clinical safety. Enforces the strict rule that AI-generated transformation logic cannot deploy to production without human inspection and approval.",
      inputReceived: "Draft FHIR R4 Mapping Contract from Agent 2 (AI Architect)",
      action:
        "Human review of interactive tables, lineage flow, and raw JSON schema. Operator approves or adjusts rules.",
      handoffOutput: "Approved & Cryptographically Signed Mapping Contract",
      passesTo: "Sentinel Validator (Agent 4)",
      done: approved,
      active: stage === 3,
      isGate: true,
      status: approved ? "Gate Cleared" : stage === 3 ? "Awaiting Operator Signature" : "Pending",
      metrics: approved ? "Approved by Operator" : "Review Required",
    },
    {
      num: 4,
      id: "agent_4_validation",
      codename: "Sentinel Validator",
      archetype: "Structural Schema Gatekeeper",
      icon: "🛡️",
      engine: "Pydantic FHIR R4B Engine",
      mission:
        "Executes zero-tolerance pre-flight validation. Enforces strict schema conformance (extra='forbid', enum bindings, ISO timestamps, required attributes).",
      inputReceived: "Approved Mapping Contract from Agent 3 & Source Records",
      action:
        "Transforms source records into FHIR R4 structures and validates against strict Pydantic models. Triggers Agent 4B if errors arise.",
      handoffOutput: healingHistory?.length > 0 ? "Validated FHIR Resources (Self-Healed)" : "Validated FHIR Resources",
      passesTo: "Dispatcher Agent (Agent 5)",
      done: validated,
      active: stage === 4,
      status: validated ? "100% Validated" : stage === 4 ? "Validating Batch…" : "Locked",
      metrics: validated ? "0 Validation Errors" : "Quality Gate",
    },
    {
      num: 5,
      id: "agent_5_dispatcher",
      codename: "Dispatcher Agent",
      archetype: "Transactional Streaming Engine",
      icon: "⚡",
      engine: "Medplum SSE Ingestion Engine",
      mission:
        "Delivers validated resources directly into Medplum's PostgreSQL database using high-speed Server-Sent Event (SSE) streaming and idempotent conditional upserts.",
      inputReceived: "100% Validated FHIR Resources from Agent 4 (Sentinel)",
      action:
        "Streams records row-by-row, manages connection pools, performs conditional upserts, tracks HTTP status codes.",
      handoffOutput: "Target Medplum Database UUIDs & Transaction Receipts",
      passesTo: "Forensic Auditor (Agent 6)",
      done: delivered,
      active: stage === 5,
      status: delivered ? "Delivered" : stage === 5 ? "Streaming…" : "Locked",
      metrics: delivered ? "Persisted to PostgreSQL :8103" : "Awaiting validation",
    },
    {
      num: 6,
      id: "agent_6_auditor",
      codename: "Forensic Auditor",
      archetype: "Provenance & Reconciliation",
      icon: "📊",
      engine: "Three-Perspective Dynamic Engine",
      mission:
        "Performs end-to-end data provenance certification. Compares raw source fields against live Medplum database fields, certifies zero data loss, and packages downloadable audit reports.",
      inputReceived: "Source Attributes + Medplum Live Database State from Agent 5",
      action:
        "Computes source-to-target field diffs, certifies reconciliation lineage, formats Excel (UTF-8 BOM) and JSON reports.",
      handoffOutput: "Certified Reconciliation Audit Bundle & Excel Package",
      passesTo: "Healthcare Operations & Compliance Team",
      done: delivered,
      active: stage === 6,
      status: delivered ? "Certified" : "Awaiting Delivery",
      metrics: delivered ? "Audit Bundle Certified" : "Awaiting execution",
    },
  ];

  const hasHealing = healingHistory && healingHistory.length > 0;

  return (
    <div
      className="card"
      style={{
        background: "linear-gradient(135deg, rgba(17, 24, 39, 0.75) 0%, rgba(30, 41, 59, 0.65) 100%)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        padding: "16px 20px",
        marginBottom: "16px",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
      }}
    >
      {/* Top Header Bar */}
      <div className="row between" style={{ margin: "0 0 14px", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "20px" }}>🌐</span>
          <div>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, letterSpacing: "0.5px" }}>
              Autonomous Multi-Agent Pipeline &amp; Governance
            </h3>
            <p className="sub-meta" style={{ margin: "1px 0 0", fontSize: "11px" }}>
              6 Specialized Agents (+ 1 Self-Healing Sub-Agent) executing end-to-end with strict Human-in-the-Loop oversight.
            </p>
          </div>
        </div>

        {/* Live Status Controls */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {/* View Mode Toggle */}
          <div style={{ display: "flex", background: "rgba(0,0,0,0.3)", borderRadius: "var(--radius-sm)", padding: "2px", border: "1px solid var(--card-border)" }}>
            <button
              className={`secondary sm ${viewMode === "relay" ? "active-pill" : ""}`}
              style={{ fontSize: "11px", padding: "3px 10px", margin: 0 }}
              onClick={() => setViewMode("relay")}
              title="Visual step-by-step agent relay handoff flow"
            >
              🔄 Relay View
            </button>
            <button
              className={`secondary sm ${viewMode === "matrix" ? "active-pill" : ""}`}
              style={{ fontSize: "11px", padding: "3px 10px", margin: 0 }}
              onClick={() => setViewMode("matrix")}
              title="Full technical matrix of all agent roles, inputs, and outputs"
            >
              📋 Agent Roster
            </button>
          </div>

          {hasHealing && (
            <span
              className="chip"
              style={{
                background: "linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(236, 72, 153, 0.25) 100%)",
                color: "#f472b6",
                border: "1px solid rgba(244, 114, 182, 0.4)",
                fontSize: "11px",
              }}
              title="Agent 4B (Self-Healer) auto-repaired schema errors in closed loop"
            >
              🩹 Self-Healed ({healingHistory.length} Fix{healingHistory.length > 1 ? "es" : ""})
            </span>
          )}

          {llmMetrics && (
            <span
              className="chip"
              style={{
                background: "rgba(16, 185, 129, 0.15)",
                color: "#10b981",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                fontSize: "11px",
              }}
              title={`Tokens: ${llmMetrics.prompt_tokens} prompt / ${llmMetrics.completion_tokens} completion • Latency: ${llmMetrics.latency_ms}ms`}
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
              ? "✓ Ingestion Complete"
              : validated
              ? "✓ Batch Validated"
              : approved
              ? "⚡ Approved by Human"
              : "🤖 Discovery Mode"}
          </span>
        </div>
      </div>

      {/* VIEW 1: RELAY VIEW (Interactive Stepper with Explicit Handoff Badges) */}
      {viewMode === "relay" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: "10px",
            position: "relative",
          }}
        >
          {AGENTS.map((agent) => {
            const isDone = agent.done;
            const isActive = agent.active && !isDone;

            return (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                style={{
                  position: "relative",
                  background: isDone
                    ? "rgba(16, 185, 129, 0.08)"
                    : isActive
                    ? "rgba(59, 130, 246, 0.15)"
                    : "rgba(0, 0, 0, 0.25)",
                  border: isDone
                    ? "1px solid rgba(16, 185, 129, 0.35)"
                    : isActive
                    ? "1px solid rgba(59, 130, 246, 0.5)"
                    : "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px",
                  cursor: "pointer",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
                className={isActive ? "agent-pulse" : ""}
                title="Click to view Agent Dossier and Handoff Details"
              >
                {/* Agent Header */}
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "6px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "18px" }}>{agent.icon}</span>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600 }}>
                        Agent {agent.num}
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: "9px",
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
                      {isDone ? "✓ Done" : isActive ? "● Active" : "Pending"}
                    </span>
                  </div>

                  {/* Agent Codename & Archetype */}
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: isDone ? "#fff" : isActive ? "#93c5fd" : "#cbd5e1",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {agent.codename}
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "var(--brand)",
                      fontWeight: 500,
                      marginBottom: "6px",
                    }}
                  >
                    {agent.archetype}
                  </div>
                </div>

                {/* Handoff Relay Badge */}
                <div>
                  <div
                    style={{
                      background: "rgba(0,0,0,0.35)",
                      borderRadius: "var(--radius-sm)",
                      padding: "4px 6px",
                      fontSize: "9px",
                      color: "var(--text-muted)",
                      lineHeight: "1.2",
                      border: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <div style={{ color: "#94a3b8", fontWeight: 600, marginBottom: "2px" }}>
                      Passes to Next Agent ➔
                    </div>
                    <div
                      style={{
                        color: isDone ? "#a7f3d0" : "#e2e8f0",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {agent.handoffOutput}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "6px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "9px",
                      color: "var(--text-muted)",
                    }}
                  >
                    <span style={{ fontStyle: "italic" }}>{agent.metrics}</span>
                    <span style={{ color: "var(--brand)", textDecoration: "underline" }}>Inspect 🔍</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW 2: FULL AGENT MATRIX TABLE */}
      {viewMode === "matrix" && (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: "18%" }}>Agent Identity</th>
                <th style={{ width: "22%" }}>Input Received (From)</th>
                <th style={{ width: "26%" }}>Autonomous Action</th>
                <th style={{ width: "22%" }}>Handoff Output (Passed To)</th>
                <th style={{ width: "12%", textAlign: "right" }}>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {AGENTS.map((a) => (
                <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => setSelectedAgent(a)}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "18px" }}>{a.icon}</span>
                      <div>
                        <strong style={{ color: "#fff", fontSize: "12px" }}>{a.codename}</strong>
                        <div className="sub-meta">{a.archetype}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: "11px", color: "var(--text)" }}>{a.inputReceived}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: "1.3" }}>
                      {a.action}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: "11px", color: "#34d399", fontWeight: 600 }}>
                      {a.handoffOutput}
                    </div>
                    <div className="sub-meta">➔ Hands to: {a.passesTo}</div>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="secondary sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAgent(a);
                      }}
                      style={{ fontSize: "11px", padding: "3px 8px" }}
                    >
                      Dossier 🔍
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* AGENT DOSSIER MODAL */}
      {selectedAgent && (
        <div className="modal-overlay" onClick={() => setSelectedAgent(null)}>
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "680px", padding: "24px" }}
          >
            {/* Modal Header */}
            <div className="row between" style={{ margin: "0 0 16px", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "28px" }}>{selectedAgent.icon}</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "17px", color: "#fff" }}>
                    {selectedAgent.codename} (Agent {selectedAgent.num})
                  </h3>
                  <div className="sub-meta" style={{ margin: "2px 0 0" }}>
                    Archetype: <strong>{selectedAgent.archetype}</strong> • Engine:{" "}
                    <code>{selectedAgent.engine}</code>
                  </div>
                </div>
              </div>

              <button className="secondary sm" onClick={() => setSelectedAgent(null)}>
                ✕ Close
              </button>
            </div>

            {/* Mission Statement */}
            <div
              style={{
                background: "rgba(0,0,0,0.25)",
                border: "1px solid var(--card-border)",
                borderRadius: "var(--radius-md)",
                padding: "12px 16px",
                marginBottom: "16px",
              }}
            >
              <h4 style={{ margin: "0 0 4px", fontSize: "12px", textTransform: "uppercase", color: "var(--brand)" }}>
                🎯 Core Mission &amp; Purpose
              </h4>
              <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.4", color: "#e2e8f0" }}>
                {selectedAgent.mission}
              </p>
            </div>

            {/* Handoff Relay Specifications */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "14px",
                marginBottom: "16px",
              }}
            >
              {/* Input Box */}
              <div
                style={{
                  background: "rgba(59, 130, 246, 0.08)",
                  border: "1px solid rgba(59, 130, 246, 0.25)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 14px",
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: "4px" }}>
                  📥 Input Artifact Received
                </div>
                <div style={{ fontSize: "12px", color: "#e2e8f0", lineHeight: "1.3" }}>
                  {selectedAgent.inputReceived}
                </div>
              </div>

              {/* Output Box */}
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 14px",
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#34d399", textTransform: "uppercase", marginBottom: "4px" }}>
                  📤 Handoff Artifact Produced
                </div>
                <div style={{ fontSize: "12px", color: "#e2e8f0", lineHeight: "1.3", fontWeight: 600 }}>
                  {selectedAgent.handoffOutput}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                  ➔ Passes to: <strong>{selectedAgent.passesTo}</strong>
                </div>
              </div>
            </div>

            {/* Action Performed */}
            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ margin: "0 0 4px", fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)" }}>
                ⚡ Processing Logic &amp; Enforcement
              </h4>
              <div style={{ fontSize: "12px", color: "#cbd5e1", lineHeight: "1.4" }}>
                {selectedAgent.action}
              </div>
            </div>

            {/* Status & Live Telemetry */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "rgba(0,0,0,0.3)",
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--card-border)",
              }}
            >
              <div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Current Status: </span>
                <span
                  className={`chip ${
                    selectedAgent.done ? "ok" : selectedAgent.active ? "info" : "warn"
                  }`}
                  style={{ fontSize: "11px" }}
                >
                  {selectedAgent.status}
                </span>
              </div>

              <div style={{ fontSize: "11px", color: "var(--brand)" }}>
                📈 Telemetry: <strong>{selectedAgent.metrics}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
