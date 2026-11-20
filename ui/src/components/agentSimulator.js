/**
 * agentSimulator.js
 * Pure, side-effect-free helpers for the Live Agent Run feed.
 *
 * DEMO MODE (?demo=1): advanceSimulator() ticks tasks forward on a timer.
 * REAL MODE (default): buildRunsFromProps() derives status from real booleans.
 */

// ─── Shared agent definitions (mirrors AgentWorkflowVisualizer AGENTS array) ──
export const AGENT_DEFS = [
  {
    id: "agent_1_extraction",
    num: 1,
    codename: "DataScout Agent",
    icon: "🤖",
    archetype: "Extraction & Discovery",
    handoffSummary: "Discovered Schema & Sample Payload",
    tasks: [
      "Connect to data source",
      "Discover headers & encodings",
      "Extract de-identified sample records",
      "Identify primary keys",
      "Package schema payload",
    ],
  },
  {
    id: "agent_2_synthesis",
    num: 2,
    codename: "AI Architect",
    icon: "🧠",
    archetype: "Semantic Reasoning",
    handoffSummary: "Draft FHIR R4 Mapping Contract",
    tasks: [
      "Receive schema payload from Agent 1",
      "Execute clinical semantic reasoning",
      "Map proprietary concepts → FHIR R4 paths",
      "Calculate confidence scores",
      "Generate transformation contract",
    ],
  },
  {
    id: "agent_3_governance",
    num: 3,
    codename: "Compliance Officer",
    icon: "👤",
    archetype: "Human-in-the-Loop Governance",
    handoffSummary: "Approved & Signed Mapping Contract",
    tasks: [
      "Receive draft mapping contract",
      "Present for operator review",
      "Await operator signature",
    ],
    isGate: true,
  },
  {
    id: "agent_4_validation",
    num: 4,
    codename: "Sentinel Validator",
    icon: "🛡️",
    archetype: "Structural Schema Gatekeeper",
    handoffSummary: "100% Validated FHIR Resources",
    tasks: [
      "Receive approved mapping contract",
      "Transform source records → FHIR R4",
      "Run Pydantic strict validation",
      "Enforce enum bindings & ISO timestamps",
      "Gate: 0 errors to pass",
    ],
  },
  {
    id: "agent_4b_healer",
    num: "4B",
    codename: "Self-Healer Sub-Agent",
    icon: "🩹",
    archetype: "Autonomous Schema Repair",
    handoffSummary: "Repaired Mapping Contract",
    tasks: [
      "Diagnose schema violations",
      "Query Gemini for repair candidates",
      "Apply targeted field corrections",
      "Re-validate repaired records",
    ],
    isSubAgent: true,
  },
  {
    id: "agent_5_dispatcher",
    num: 5,
    codename: "Dispatcher Agent",
    icon: "⚡",
    archetype: "Transactional Streaming Engine",
    handoffSummary: "Target Medplum UUIDs & Transaction Receipts",
    tasks: [
      "Receive validated FHIR resources",
      "Open SSE stream to Medplum :8103",
      "Stream row-by-row with idempotent upserts",
      "Track HTTP status codes",
      "Confirm persistence",
    ],
  },
  {
    id: "agent_6_auditor",
    num: 6,
    codename: "Forensic Auditor",
    icon: "📊",
    archetype: "Provenance & Reconciliation",
    handoffSummary: "Certified Reconciliation Audit Bundle",
    tasks: [
      "Receive source attributes + Medplum state",
      "Compute source-to-target field diffs",
      "Certify zero data loss",
      "Format Excel (UTF-8 BOM) & JSON reports",
      "Publish audit bundle",
    ],
  },
];

/** Build a fresh AgentRun from a definition (all tasks pending) */
function makeRun(def, overrides = {}) {
  return {
    id: def.id,
    num: def.num,
    codename: def.codename,
    icon: def.icon,
    archetype: def.archetype,
    handoffSummary: def.handoffSummary,
    isSubAgent: def.isSubAgent ?? false,
    isGate: def.isGate ?? false,
    tasks: def.tasks.map((label) => ({ label, done: false })),
    status: "pending",
    startedAt: null,
    finishedAt: null,
    errorDetail: null,
    ...overrides,
  };
}

// ─── REAL MODE ───────────────────────────────────────────────────────────────

/**
 * Build AgentRun[] from the real boolean props.
 * No fake tasks ticked — tasks array is empty in real mode.
 */
export function buildRunsFromProps({
  recordsCount,
  llmMetrics,
  approved,
  validated,
  delivered,
  healingHistory,
}) {
  const hasData = recordsCount > 0;
  const hasLlm = !!llmMetrics || approved;
  const hasHealing = healingHistory && healingHistory.length > 0;

  const runs = [];

  // Agent 1
  runs.push({
    ...makeRun(AGENT_DEFS[0]),
    tasks: [],
    status: hasData ? "done" : "running",
    startedAt: hasData ? Date.now() - 2000 : Date.now(),
    finishedAt: hasData ? Date.now() : null,
  });

  if (!hasData) return runs;

  // Agent 2
  runs.push({
    ...makeRun(AGENT_DEFS[1]),
    tasks: [],
    status: hasLlm ? "done" : "running",
    startedAt: Date.now() - 1500,
    finishedAt: hasLlm ? Date.now() : null,
  });

  if (!hasLlm) return runs;

  // Agent 3 — gate
  runs.push({
    ...makeRun(AGENT_DEFS[2]),
    tasks: [],
    status: approved ? "done" : "waiting_human",
    startedAt: Date.now() - 1000,
    finishedAt: approved ? Date.now() : null,
  });

  if (!approved) return runs;

  // Agent 4
  const agent4Status = validated ? "done" : hasHealing ? "error" : "running";
  runs.push({
    ...makeRun(AGENT_DEFS[3]),
    tasks: [],
    status: agent4Status,
    startedAt: Date.now() - 800,
    finishedAt: validated ? Date.now() : null,
    errorDetail: hasHealing ? "Schema violations detected — Self-Healer invoked" : null,
  });

  // Agent 4B sub-agent (only when healing happened)
  if (hasHealing) {
    runs.push({
      ...makeRun(AGENT_DEFS[4]),
      tasks: [],
      status: validated ? "done" : "running",
      startedAt: Date.now() - 600,
      finishedAt: validated ? Date.now() : null,
      isSubAgent: true,
    });
  }

  if (!validated) return runs;

  // Agent 5
  runs.push({
    ...makeRun(AGENT_DEFS[5]),
    tasks: [],
    status: delivered ? "done" : "running",
    startedAt: Date.now() - 500,
    finishedAt: delivered ? Date.now() : null,
  });

  if (!delivered) return runs;

  // Agent 6
  runs.push({
    ...makeRun(AGENT_DEFS[6]),
    tasks: [],
    status: "done",
    startedAt: Date.now() - 200,
    finishedAt: Date.now(),
  });

  return runs;
}

// ─── DEMO MODE (?demo=1) ─────────────────────────────────────────────────────

/** All 6 (+ optional 4B) agent definitions used in demo */
const DEMO_AGENT_DEFS = [
  AGENT_DEFS[0],
  AGENT_DEFS[1],
  AGENT_DEFS[2],
  AGENT_DEFS[3],
  AGENT_DEFS[5], // skip 4B unless triggered
  AGENT_DEFS[6],
];

export function initDemoRuns() {
  return DEMO_AGENT_DEFS.map((def) => makeRun(def));
}

/**
 * advanceSimulator(prev, tick)
 * Pure function: advances the demo state one tick.
 * Returns new AgentRun[] (no mutation).
 */
export function advanceSimulator(prev) {
  if (!prev || prev.length === 0) {
    // Bootstrap — start Agent 1
    const runs = DEMO_AGENT_DEFS.map((def) => makeRun(def));
    return startAgent(runs, 0);
  }

  const runs = prev.map((r) => ({ ...r, tasks: r.tasks.map((t) => ({ ...t })) }));
  const runningIdx = runs.findIndex((r) => r.status === "running");

  // ── tick the running agent ──────────────────────────────────
  if (runningIdx !== -1) {
    const run = runs[runningIdx];
    const nextTask = run.tasks.findIndex((t) => !t.done);
    if (nextTask !== -1) {
      run.tasks[nextTask].done = true;
      return runs;
    }
    // All tasks done → finish this agent
    run.status = "done";
    run.finishedAt = Date.now();
    // Start next agent (skipping sub-agents in the main sequence)
    const nextIdx = runs.findIndex((r, i) => i > runningIdx && r.status === "pending" && !r.isSubAgent);
    if (nextIdx !== -1) {
      return startAgent(runs, nextIdx);
    }
    return runs;
  }

  // ── handle waiting_human (Agent 3) ────────────────────────
  const waitingIdx = runs.findIndex((r) => r.status === "waiting_human");
  if (waitingIdx !== -1) {
    // Stay waiting — only user action resolves this
    return runs;
  }

  return runs;
}

function startAgent(runs, idx) {
  const run = runs[idx];
  // Agent 3 → waiting_human
  if (run.isGate) {
    run.status = "waiting_human";
  } else {
    run.status = "running";
  }
  run.startedAt = Date.now();
  return runs;
}

/**
 * approveDemoRun(prev)
 * Called when user clicks Approve in demo mode — resolves Agent 3.
 */
export function approveDemoRun(prev) {
  const runs = prev.map((r) => ({ ...r, tasks: r.tasks.map((t) => ({ ...t })) }));
  const gateIdx = runs.findIndex((r) => r.status === "waiting_human");
  if (gateIdx === -1) return runs;
  const run = runs[gateIdx];
  run.status = "done";
  run.finishedAt = Date.now();
  const nextIdx = runs.findIndex((r, i) => i > gateIdx && r.status === "pending" && !r.isSubAgent);
  if (nextIdx !== -1) return startAgent(runs, nextIdx);
  return runs;
}

/** Utility: duration in seconds from startedAt to finishedAt (or now) */
export function durationSec(run) {
  if (!run.startedAt) return null;
  const end = run.finishedAt ?? Date.now();
  return ((end - run.startedAt) / 1000).toFixed(1);
}

