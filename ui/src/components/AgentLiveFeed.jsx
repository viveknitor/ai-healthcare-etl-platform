/**
 * AgentLiveFeed.jsx
 * Animated sequential live-run feed for the multi-agent pipeline.
 *
 * Rules enforced here:
 * - Only renders agents whose status !== 'pending'
 * - Self-healer (4B) appears as indented sub-panel under Agent 4 on error
 * - Agent 3 waiting_human → shows Approve / Reject buttons wired to onApprove
 * - Done panels collapse to one line; click to expand
 * - Auto-scrolls to latest running/waiting panel; stops if user scrolled up
 * - aria-live on a short status line only
 * - MotionConfig reducedMotion="user" (Decision Q5)
 * - Interval runs only while something is running (Decision Q6)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  AnimatePresence,
  motion,
  MotionConfig,
} from "framer-motion";
import { durationSec } from "./agentSimulator.js";

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusLabel(status) {
  switch (status) {
    case "running":       return "● Running";
    case "done":          return "✓ Done";
    case "error":         return "⚠ Error";
    case "waiting_human": return "⏳ Waiting";
    default:              return status;
  }
}

function statusClass(status) {
  switch (status) {
    case "running":       return "running";
    case "done":          return "done";
    case "error":         return "error";
    case "waiting_human": return "waiting";
    default:              return "";
  }
}

// ─── Single Agent Run Panel ───────────────────────────────────────────────────

function AgentRunPanel({ run, onApprove, onInspect, isSubAgent }) {
  const [expanded, setExpanded] = useState(run.status !== "done");
  const panelId = `feed-panel-${run.id}`;
  const bodyId = `feed-body-${run.id}`;

  // Auto-expand when status changes away from done
  useEffect(() => {
    if (run.status !== "done") setExpanded(true);
  }, [run.status]);

  const panelClass = [
    "agent-run-panel",
    statusClass(run.status),
    isSubAgent || run.isSubAgent ? "sub-agent" : "",
  ].filter(Boolean).join(" ");

  const dur = durationSec(run);

  return (
    <div
      id={panelId}
      className={panelClass}
      tabIndex={0}
      role="region"
      aria-label={`${run.codename} — ${statusLabel(run.status)}`}
    >
      {/* ── Collapsed one-liner (done state) ── */}
      {run.status === "done" && !expanded ? (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px" }}>
          <span style={{ fontSize: "16px" }}>{run.icon}</span>
          <strong style={{ color: "#fff", whiteSpace: "nowrap" }}>{run.codename}</strong>
          <span style={{ color: "var(--ok)", fontWeight: 700 }}>✓ Done</span>
          <span style={{ color: "var(--text-muted)", flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {run.handoffSummary}
          </span>
          {dur && (
            <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{dur}s</span>
          )}
          <button
            aria-expanded={false}
            aria-controls={bodyId}
            onClick={() => setExpanded(true)}
            style={{
              background: "none",
              border: "1px solid var(--card-border)",
              color: "var(--text-muted)",
              borderRadius: "var(--radius-sm)",
              padding: "1px 8px",
              fontSize: "11px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            ▶ Expand
          </button>
        </div>
      ) : (
        /* ── Expanded panel ── */
        <div id={bodyId}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontSize: "18px" }}>{run.icon}</span>
            <div style={{ flexGrow: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <strong style={{ fontSize: "13px", color: "#fff" }}>
                  {run.codename}
                  {run.isSubAgent && (
                    <span style={{ fontSize: "10px", color: "#a855f7", marginLeft: "6px", fontWeight: 400 }}>
                      sub-agent
                    </span>
                  )}
                </strong>
                {/* Status badge: icon + text, never color alone */}
                <span
                  className={`chip ${
                    run.status === "done" ? "ok" :
                    run.status === "error" ? "bad" :
                    run.status === "waiting_human" ? "warn" : "info"
                  }`}
                  style={{ fontSize: "10px", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <span
                    className={`status-dot-live ${statusClass(run.status)}`}
                    aria-hidden="true"
                  />
                  {statusLabel(run.status)}
                </span>
                {dur && run.status === "done" && (
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{dur}s</span>
                )}
              </div>
              <div style={{ fontSize: "10px", color: "var(--brand)", marginTop: "1px" }}>
                {run.archetype}
              </div>
            </div>

            {/* Collapse button (only if done) */}
            {run.status === "done" && (
              <button
                aria-expanded={true}
                aria-controls={bodyId}
                onClick={() => setExpanded(false)}
                style={{
                  background: "none",
                  border: "1px solid var(--card-border)",
                  color: "var(--text-muted)",
                  borderRadius: "var(--radius-sm)",
                  padding: "1px 8px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                ▲ Collapse
              </button>
            )}

            {/* Inspect link */}
            {onInspect && (
              <button
                onClick={() => onInspect(run)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--brand)",
                  fontSize: "11px",
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                Inspect 🔍
              </button>
            )}
          </div>

          {/* Task checklist (only shown in demo mode — tasks array populated) */}
          {run.tasks && run.tasks.length > 0 && (
            <div style={{ marginBottom: "10px", paddingLeft: "26px" }}>
              {run.tasks.map((task, i) => (
                <div key={i} className={`task-item ${task.done ? "done" : "pending"}`}>
                  <span aria-hidden="true">{task.done ? "✓" : "○"}</span>
                  <span>{task.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Error detail */}
          {run.status === "error" && run.errorDetail && (
            <div
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 10px",
                fontSize: "12px",
                color: "var(--bad)",
                marginBottom: "10px",
              }}
            >
              ⚠ {run.errorDetail}
            </div>
          )}

          {/* waiting_human — Approve / Reject gate (Agent 3 only) */}
          {run.status === "waiting_human" && (
            <div
              style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 14px",
                marginBottom: "4px",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--warn)", marginBottom: "8px" }}>
                ⏳ Needs your approval — review the mapping contract below before proceeding.
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="primary success"
                  style={{ padding: "5px 14px", fontSize: "12px" }}
                  onClick={() => onApprove && onApprove()}
                >
                  ✓ Approve Contract
                </button>
                <button
                  className="secondary"
                  style={{ padding: "5px 14px", fontSize: "12px" }}
                  onClick={() => {/* rejection is UI-only feedback, no backend */}}
                >
                  ✗ Reject
                </button>
              </div>
            </div>
          )}

          {/* Handoff summary (done) */}
          {run.status === "done" && (
            <div
              style={{
                background: "rgba(16,185,129,0.06)",
                border: "1px solid rgba(16,185,129,0.2)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 10px",
                fontSize: "11px",
                color: "#a7f3d0",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>📤</span>
              <span>Passed to next agent: <strong>{run.handoffSummary}</strong></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Feed Component ──────────────────────────────────────────────────────

export default function AgentLiveFeed({ agentRuns, onApprove, onInspect }) {
  const feedRef = useRef(null);
  const [userScrolled, setUserScrolled] = useState(false);

  // Find the latest active panel id (running or waiting_human)
  const latestActiveId = [...agentRuns].reverse().find(
    (r) => r.status === "running" || r.status === "waiting_human"
  )?.id;

  // Auto-scroll to latest active panel (Decision Q4)
  useEffect(() => {
    if (!userScrolled && latestActiveId) {
      const el = document.getElementById("feed-panel-" + latestActiveId);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [latestActiveId, userScrolled]);

  const handleScroll = useCallback((e) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setUserScrolled(!atBottom);
  }, []);

  // Visible runs: not pending, ordered by num
  const visibleRuns = agentRuns.filter((r) => r.status !== "pending");

  // Split: main sequence (non sub-agent) and the self-healer sub-agent
  const mainRuns = visibleRuns.filter((r) => !r.isSubAgent);
  const subAgentRun = visibleRuns.find((r) => r.isSubAgent);

  // Status line for aria-live (Decision Q7)
  const statusLine = (() => {
    const active = agentRuns.find((r) => r.status === "running" || r.status === "waiting_human");
    if (!active) return "";
    return active.status === "waiting_human"
      ? `${active.codename} — Waiting for operator approval`
      : `${active.codename} — Running`;
  })();

  if (visibleRuns.length === 0) return null;

  return (
    <MotionConfig reducedMotion="user">
      <div style={{ marginTop: "14px" }}>
        {/* aria-live status line only (Decision Q7) */}
        <div
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            overflow: "hidden",
            clip: "rect(0,0,0,0)",
            whiteSpace: "nowrap",
          }}
        >
          {statusLine}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            ⚡ Live Run Feed
          </span>
          {statusLine && (
            <span className="chip info" style={{ fontSize: "10px" }}>
              {statusLine}
            </span>
          )}
        </div>

        <div
          ref={feedRef}
          className="agent-run-feed"
          role="log"
          aria-label="Live agent execution feed"
          onScroll={handleScroll}
        >
          <AnimatePresence initial={false}>
            {mainRuns.map((run) => (
              <motion.div
                key={run.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <AgentRunPanel
                  run={run}
                  onApprove={onApprove}
                  onInspect={onInspect}
                />
                {/* Self-Healer sub-panel: render under Agent 4 when error */}
                {run.id === "agent_4_validation" &&
                  run.status === "error" &&
                  subAgentRun && (
                    <motion.div
                      key={subAgentRun.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut", delay: 0.1 }}
                      style={{ marginTop: "6px" }}
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
    </MotionConfig>
  );
}

