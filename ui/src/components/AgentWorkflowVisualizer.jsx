import React, { useState, useEffect, useRef } from "react";
import {
  Network,
  ListChecks,
  GitBranch,
  Wrench,
  Coins,
  CheckCircle2,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import AgentLiveFeed from "./AgentLiveFeed.jsx";
import AgentDossierDialog from "@/components/modals/AgentDossierDialog.jsx";
import { AGENT_DEFS } from "./agentRegistry.js";
import {
  buildRunsFromProps,
  initDemoRuns,
  advanceSimulator,
  approveDemoRun,
} from "./agentSimulator.js";
import SegmentedTabs from "@/components/ui/Tabs.jsx";
import Badge from "@/components/ui/Badge.jsx";
import Button from "@/components/ui/Button.jsx";
import { cn } from "@/utils/cn.js";

const EMPTY_HEALING_HISTORY = [];

const IS_DEMO =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("demo") === "1";

export default function AgentWorkflowVisualizer({
  defaultCollapsed = false,
  llmMetrics = null,
  datasetName = "Upload",
  recordsCount = 0,
  approved = false,
  validated = false,
  delivered = false,
  healingHistory = EMPTY_HEALING_HISTORY,
  onApprove = () => {},
  onReject,
}) {
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [viewMode, setViewMode] = useState("relay"); // "relay" | "matrix"
  const [agentRuns, setAgentRuns] = useState(() => (IS_DEMO ? initDemoRuns() : []));
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!IS_DEMO) return;
    const hasActive = agentRuns.some(
      (r) => r.status === "running" || r.status === "waiting_human"
    );
    if (!hasActive) {
      clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setAgentRuns((prev) => advanceSimulator(prev));
    }, 900);
    return () => clearInterval(intervalRef.current);
  }, [agentRuns]);

  useEffect(() => {
    if (IS_DEMO) return;
    setAgentRuns((prev) =>
      buildRunsFromProps({
        recordsCount,
        llmMetrics,
        approved,
        validated,
        delivered,
        healingHistory,
        prevRuns: prev,
      })
    );
  }, [recordsCount, llmMetrics, approved, validated, delivered, healingHistory]);

  const handleApprove = () => {
    if (IS_DEMO) {
      setAgentRuns((prev) => approveDemoRun(prev));
    }
    onApprove();
  };

  let stage = 1;
  if (delivered) stage = 6;
  else if (validated) stage = 5;
  else if (approved) stage = 4;
  else if (llmMetrics) stage = 3;
  else if (recordsCount > 0) stage = 2;

  const relayDefs = AGENT_DEFS.filter((d) => !d.isSubAgent);
  const AGENTS = relayDefs.map((def) => {
    if (def.id === "agent_1_extraction") {
      return {
        ...def,
        inputReceived: `Source dataset "${datasetName}" (${recordsCount || 0} rows)`,
        handoffOutput: "Discovered Schema & Sample Payload",
        done: recordsCount > 0,
        active: stage === 1,
        status: recordsCount > 0 ? "Done" : "Awaiting Data",
        metrics: `${recordsCount || 0} rows extracted`,
      };
    }
    if (def.id === "agent_2_synthesis") {
      return {
        ...def,
        engine: llmMetrics?.model || def.engine,
        inputReceived: "Discovered Schema & Sample Record from Agent 1",
        handoffOutput: "Draft FHIR R4 Mapping Contract",
        done: Boolean(llmMetrics) || approved,
        active: stage === 2,
        status: approved || llmMetrics ? "Done" : stage === 2 ? "Synthesizing…" : "Pending",
        metrics: llmMetrics
          ? `${llmMetrics.total_tokens || 0} tokens • ${llmMetrics.cost_formatted || "$0.00018"} • ${llmMetrics.latency_ms || 0}ms`
          : "Awaiting Agent 1",
      };
    }
    if (def.id === "agent_3_governance") {
      return {
        ...def,
        inputReceived: "Draft FHIR R4 Mapping Contract from Agent 2",
        handoffOutput: "Approved & Signed Mapping Contract",
        done: approved,
        active: stage === 3,
        status: approved ? "Gate Cleared" : stage === 3 ? "Awaiting Signature" : "Pending",
        metrics: approved ? "Approved by Operator" : "Review Required",
      };
    }
    if (def.id === "agent_4_validation") {
      return {
        ...def,
        inputReceived: "Approved Mapping Contract + Source Records",
        handoffOutput:
          healingHistory?.length > 0
            ? "Validated FHIR Resources (Self-Healed)"
            : "Validated FHIR Resources",
        done: validated,
        active: stage === 4,
        status: validated ? "100% Validated" : stage === 4 ? "Validating…" : "Locked",
        metrics: validated ? "0 Validation Errors" : "Quality Gate",
      };
    }
    if (def.id === "agent_5_dispatcher") {
      return {
        ...def,
        inputReceived: "100% Validated FHIR Resources from Agent 4",
        handoffOutput: "Target Medplum UUIDs & Transaction Receipts",
        done: delivered,
        active: stage === 5,
        status: delivered ? "Delivered" : stage === 5 ? "Streaming…" : "Locked",
        metrics: delivered ? "Persisted to Medplum :8103" : "Awaiting Validation",
      };
    }
    return {
      ...def,
      inputReceived: "Source Attributes + Medplum Database State",
      handoffOutput: "Certified Reconciliation Audit Bundle",
      done: delivered,
      active: stage === 6,
      status: delivered ? "Certified" : "Awaiting Delivery",
      metrics: delivered ? "Audit Bundle Certified" : "Awaiting Execution",
    };
  });

  const hasHealing = Boolean(healingHistory && healingHistory.length > 0);

  const scrollToPanel = (agent) => {
    const el = document.getElementById(`feed-panel-${agent.id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      setSelectedAgent(agent);
    }
  };

  const SHORT_LABELS = {
    agent_1_extraction: "Extraction",
    agent_2_synthesis: "AI Mapping",
    agent_3_governance: "Approval",
    agent_4_validation: "Validation",
    agent_5_dispatcher: "Delivery",
    agent_6_auditor: "Audit",
  };

  const statusText = delivered
    ? "Complete"
    : validated
    ? "Validated"
    : approved
    ? "Approved"
    : "Draft";

  const statusTone = delivered ? "ok" : validated ? "brand" : approved ? "warn" : "ai";

  return (
    <section
      aria-label="Agent Pipeline"
      className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 shadow-[var(--shadow-sm)] space-y-3.5"
    >
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--brand-border)] bg-[var(--brand-bg)] text-[var(--brand)]">
            <Network className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div className="flex items-center gap-2">
            <h2 className="m-0 text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Agent Pipeline
            </h2>
            {IS_DEMO && (
              <Badge tone="warn">Demo</Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {expanded && (
            <SegmentedTabs
              ariaLabel="Agent visualizer mode"
              value={viewMode}
              onChange={setViewMode}
              items={[
                { value: "relay", label: "Flow", icon: GitBranch },
                { value: "matrix", label: "Roster", icon: ListChecks },
              ]}
            />
          )}

          {hasHealing && (
            <Badge tone="ai" icon={Wrench}>
              Healed ({healingHistory.length})
            </Badge>
          )}

          {llmMetrics && (
            <Badge
              tone="ok"
              icon={Coins}
              title={`Tokens: ${llmMetrics.prompt_tokens} prompt / ${llmMetrics.completion_tokens} completion • Latency: ${llmMetrics.latency_ms}ms`}
            >
              {llmMetrics.cost_formatted || "$0.00018"} · {llmMetrics.total_tokens} tok
            </Badge>
          )}

          <Badge tone={statusTone} icon={CheckCircle2}>
            {statusText}
          </Badge>

          <Button
            size="sm"
            variant="ghost"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                Hide
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                Details
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Relay Stepper */}
      {expanded && viewMode === "relay" && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {AGENTS.map((agent) => {
              const Icon = agent.icon;
              const isDone = agent.done;
              const isActive = agent.active && !isDone;
              const isPending = !isDone && !isActive;

              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => scrollToPanel(agent)}
                  aria-current={isActive ? "step" : undefined}
                  className={cn(
                    "flex min-h-[76px] flex-col justify-between gap-1.5 rounded-[var(--radius-md)] border p-2.5 text-left transition-colors duration-150 cursor-pointer",
                    isDone
                      ? "border-[var(--ok-border)] bg-[var(--ok-bg)]"
                      : isActive
                      ? "border-[var(--brand-border)] bg-[var(--brand-bg)]"
                      : "border-[var(--border-default)] bg-[var(--bg-subtle)]/60 opacity-65 hover:opacity-100",
                    "hover:border-[var(--border-strong)]"
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5">
                      <Icon
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          isDone
                            ? "text-[var(--ok)]"
                            : isActive
                            ? "text-[var(--brand)]"
                            : "text-[var(--text-muted)]"
                        )}
                        aria-hidden="true"
                      />
                      <span className="text-xs font-bold tabular-nums text-[var(--text-muted)]">
                        A{agent.num}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-semibold",
                        isDone
                          ? "bg-[var(--bg-surface)] text-[var(--ok)]"
                          : isActive
                          ? "bg-[var(--bg-surface)] text-[var(--brand)]"
                          : "text-[var(--text-muted)]"
                      )}
                    >
                      {isDone ? "Done" : isActive ? "Active" : isPending ? "Wait" : "—"}
                    </span>
                  </div>

                  <div>
                    <div className="truncate text-xs font-bold text-[var(--text-primary)]">
                      {SHORT_LABELS[agent.id] || agent.codename}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <AgentLiveFeed
            agentRuns={agentRuns}
            onApprove={handleApprove}
            onReject={onReject}
            onInspect={(run) => {
              const full = AGENTS.find((a) => a.id === run.id);
              setSelectedAgent(full || { ...run, ...AGENT_DEFS.find((d) => d.id === run.id) });
            }}
          />
        </>
      )}

      {/* Full Roster Matrix */}
      {expanded && viewMode === "matrix" && (
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-default)]">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-muted)]">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-semibold">Agent Identity</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Input Received</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Autonomous Action</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Handoff Output</th>
                <th scope="col" className="px-3 py-2.5 font-semibold text-right">Dossier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-default)]">
              {AGENTS.map((a) => {
                const Icon = a.icon;
                return (
                  <tr key={a.id} className="hover:bg-[var(--bg-subtle)]/60">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden="true" />
                        <div>
                          <strong className="text-[var(--text-primary)]">{a.codename}</strong>
                          <div className="text-[var(--text-muted)]">{a.archetype}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">{a.inputReceived}</td>
                    <td className="px-3 py-2.5 text-[var(--text-muted)]">{a.action}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-[var(--ok)]">{a.handoffOutput}</div>
                      <div className="text-[var(--text-muted)]">Next: {a.passesTo}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button size="sm" variant="secondary" onClick={() => setSelectedAgent(a)}>
                        <Search className="h-3.5 w-3.5" aria-hidden="true" />
                        Dossier
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AgentDossierDialog agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
    </section>
  );
}
