import React, { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Search,
  Send,
} from "lucide-react";
import { durationSec } from "./agentSimulator.js";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import { cn } from "@/utils/cn.js";

function getStatusMeta(status) {
  switch (status) {
    case "running":
      return { label: "Running", tone: "info", icon: Loader2, spin: true };
    case "done":
      return { label: "Done", tone: "ok", icon: CheckCircle2, spin: false };
    case "error":
      return { label: "Error", tone: "bad", icon: AlertTriangle, spin: false };
    case "waiting_human":
      return { label: "Awaiting Approval", tone: "warn", icon: Clock, spin: false };
    default:
      return { label: status, tone: "neutral", icon: Clock, spin: false };
  }
}

function AgentRunPanel({ run, onApprove, onReject, onInspect, isSubAgent }) {
  const [expanded, setExpanded] = useState(run.status !== "done");
  const bodyId = `feed-body-${run.id}`;

  useEffect(() => {
    if (run.status !== "done") setExpanded(true);
  }, [run.status]);

  const dur = durationSec(run);
  const meta = getStatusMeta(run.status);
  const AgentIcon = run.icon;
  const StatusIcon = meta.icon;

  const borderAccent =
    run.status === "done"
      ? "border-l-[var(--ok)]"
      : run.status === "error"
      ? "border-l-[var(--bad)]"
      : run.status === "waiting_human"
      ? "border-l-[var(--warn)]"
      : "border-l-[var(--brand)]";

  return (
    <div
      id={`feed-panel-${run.id}`}
      role="region"
      aria-label={`${run.codename} — ${meta.label}`}
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--border-default)] border-l-[3px] bg-[var(--bg-surface)] px-3.5 py-2.5",
        borderAccent,
        (isSubAgent || run.isSubAgent) && "ml-6 border-l-[var(--ai)]"
      )}
    >
      {run.status === "done" && !expanded ? (
        <div className="flex items-center gap-2.5 text-xs">
          {AgentIcon && <AgentIcon className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />}
          <strong className="whitespace-nowrap text-[var(--text-primary)]">{run.codename}</strong>
          <Badge tone="ok" icon={CheckCircle2}>
            Done
          </Badge>
          <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]">
            {run.handoffSummary}
          </span>
          {dur && <span className="tabular-nums text-[var(--text-muted)]">{dur}s</span>}
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={false}
            aria-controls={bodyId}
            onClick={() => setExpanded(true)}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            Expand
          </Button>
        </div>
      ) : (
        <div id={bodyId} className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {AgentIcon && (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-primary)]">
                  <AgentIcon className="h-4 w-4" aria-hidden="true" />
                </span>
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-[13px] text-[var(--text-primary)]">{run.codename}</strong>
                  {run.isSubAgent && <Badge tone="ai">Sub-Agent</Badge>}
                  <Badge tone={meta.tone} icon={StatusIcon}>
                    {meta.label}
                  </Badge>
                  {dur && run.status === "done" && (
                    <span className="text-xs tabular-nums text-[var(--text-muted)]">{dur}s</span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)]">{run.archetype}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {run.status === "done" && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-expanded={true}
                  aria-controls={bodyId}
                  onClick={() => setExpanded(false)}
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  Collapse
                </Button>
              )}
              {onInspect && (
                <Button size="sm" variant="link" onClick={() => onInspect(run)}>
                  <Search className="h-3.5 w-3.5" aria-hidden="true" />
                  Inspect
                </Button>
              )}
            </div>
          </div>

          {run.tasks && run.tasks.length > 0 && (
            <ul className="m-0 list-none space-y-1 pl-9 text-xs">
              {run.tasks.map((task, i) => (
                <li
                  key={task.label + i}
                  className={cn(
                    "flex items-center gap-2",
                    task.done ? "text-[var(--ok)] font-medium" : "text-[var(--text-muted)]"
                  )}
                >
                  <span aria-hidden="true">{task.done ? "✓" : "○"}</span>
                  <span>{task.label}</span>
                </li>
              ))}
            </ul>
          )}

          {run.status === "error" && run.errorDetail && (
            <div
              role="alert"
              className="rounded-[var(--radius-sm)] border border-[var(--bad-border)] bg-[var(--bad-bg)] px-3 py-2 text-xs font-medium text-[var(--bad)]"
            >
              {run.errorDetail}
            </div>
          )}

          {run.status === "waiting_human" && (
            <div className="rounded-[var(--radius-sm)] border border-[var(--warn-border)] bg-[var(--warn-bg)] px-3.5 py-2.5 space-y-2">
              <div className="text-xs font-semibold text-[var(--warn)]">
                Human Governance Gate — review the mapping contract rules below before proceeding.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="success" onClick={() => onApprove?.()}>
                  Approve Contract
                </Button>
                {onReject && (
                  <Button size="sm" variant="secondary" onClick={() => onReject()}>
                    Review / Edit Rules
                  </Button>
                )}
              </div>
            </div>
          )}

          {run.status === "done" && (
            <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--ok-border)] bg-[var(--ok-bg)] px-3 py-1.5 text-xs text-[var(--ok)]">
              <Send className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Handoff: <strong>{run.handoffSummary}</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentLiveFeed({ agentRuns, onApprove, onReject, onInspect }) {
  const feedRef = useRef(null);
  const [userScrolled, setUserScrolled] = useState(false);

  const latestActiveId = [...agentRuns]
    .reverse()
    .find((r) => r.status === "running" || r.status === "waiting_human")?.id;

  useEffect(() => {
    if (!userScrolled && latestActiveId) {
      const el = document.getElementById(`feed-panel-${latestActiveId}`);
      el?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    }
  }, [latestActiveId, userScrolled]);

  const handleScroll = useCallback((e) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setUserScrolled(!atBottom);
  }, []);

  const visibleRuns = agentRuns.filter((r) => r.status !== "pending");
  const mainRuns = visibleRuns.filter((r) => !r.isSubAgent);
  const subAgentRun = visibleRuns.find((r) => r.isSubAgent);

  const active = agentRuns.find((r) => r.status === "running" || r.status === "waiting_human");
  const statusLine = active
    ? active.status === "waiting_human"
      ? `${active.codename} — Waiting for operator approval`
      : `${active.codename} — Running`
    : "";

  if (visibleRuns.length === 0) return null;

  return (
    <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {statusLine}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Live Agent Run Feed
        </span>
        {statusLine && <Badge tone="info">{statusLine}</Badge>}
      </div>

      <div
        ref={feedRef}
        role="log"
        aria-label="Live agent execution feed"
        onScroll={handleScroll}
        className="max-h-[340px] space-y-1.5 overflow-y-auto pr-1 overscroll-contain"
      >
        <AnimatePresence initial={false}>
          {mainRuns.map((run) => (
            <motion.div
              key={run.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            >
              <AgentRunPanel
                run={run}
                onApprove={onApprove}
                onReject={onReject}
                onInspect={onInspect}
              />
              {run.id === "agent_4_validation" && run.status === "error" && subAgentRun && (
                <motion.div
                  key={subAgentRun.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                  className="mt-1.5"
                >
                  <AgentRunPanel
                    run={subAgentRun}
                    onApprove={null}
                    onInspect={onInspect}
                    isSubAgent
                  />
                </motion.div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
