import { AGENT_DEFS } from "./agentRegistry.js";

export { AGENT_DEFS };

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

/**
 * Derive agent run states deterministically from pipeline booleans without regenerating timestamps.
 */
export function buildRunsFromProps({
  recordsCount,
  llmMetrics,
  approved,
  validated,
  delivered,
  healingHistory,
  prevRuns = [],
}) {
  const prevById = new Map(prevRuns.map((r) => [r.id, r]));
  const now = Date.now();
  const hasData = recordsCount > 0;
  const hasLlm = Boolean(llmMetrics) || approved;
  const hasHealing = Boolean(healingHistory && healingHistory.length > 0);

  const stampTiming = (id, status) => {
    const prev = prevById.get(id);
    const startedAt = prev?.startedAt || now;
    const finishedAt =
      status === "done" ? prev?.finishedAt || now : null;
    return { startedAt, finishedAt };
  };

  const runs = [];

  const a1Status = hasData ? "done" : "running";
  runs.push({
    ...makeRun(AGENT_DEFS[0]),
    tasks: [],
    status: a1Status,
    ...stampTiming(AGENT_DEFS[0].id, a1Status),
  });
  if (!hasData) return runs;

  const a2Status = hasLlm ? "done" : "running";
  runs.push({
    ...makeRun(AGENT_DEFS[1]),
    tasks: [],
    status: a2Status,
    ...stampTiming(AGENT_DEFS[1].id, a2Status),
  });
  if (!hasLlm) return runs;

  const a3Status = approved ? "done" : "waiting_human";
  runs.push({
    ...makeRun(AGENT_DEFS[2]),
    tasks: [],
    status: a3Status,
    ...stampTiming(AGENT_DEFS[2].id, a3Status),
  });
  if (!approved) return runs;

  const a4Status = validated ? "done" : hasHealing ? "error" : "running";
  runs.push({
    ...makeRun(AGENT_DEFS[3]),
    tasks: [],
    status: a4Status,
    ...stampTiming(AGENT_DEFS[3].id, a4Status),
    errorDetail: hasHealing ? "Schema violations detected — Self-Healer invoked" : null,
  });

  if (hasHealing) {
    const a4bStatus = validated ? "done" : "running";
    runs.push({
      ...makeRun(AGENT_DEFS[4]),
      tasks: [],
      status: a4bStatus,
      ...stampTiming(AGENT_DEFS[4].id, a4bStatus),
      isSubAgent: true,
    });
  }

  if (!validated) return runs;

  const a5Status = delivered ? "done" : "running";
  runs.push({
    ...makeRun(AGENT_DEFS[5]),
    tasks: [],
    status: a5Status,
    ...stampTiming(AGENT_DEFS[5].id, a5Status),
  });
  if (!delivered) return runs;

  runs.push({
    ...makeRun(AGENT_DEFS[6]),
    tasks: [],
    status: "done",
    ...stampTiming(AGENT_DEFS[6].id, "done"),
  });

  return runs;
}

const DEMO_AGENT_DEFS = [
  AGENT_DEFS[0],
  AGENT_DEFS[1],
  AGENT_DEFS[2],
  AGENT_DEFS[3],
  AGENT_DEFS[5],
  AGENT_DEFS[6],
];

export function initDemoRuns() {
  return DEMO_AGENT_DEFS.map((def) => makeRun(def));
}

function startAgent(runs, idx) {
  const run = runs[idx];
  run.status = run.isGate ? "waiting_human" : "running";
  run.startedAt = Date.now();
  return runs;
}

export function advanceSimulator(prev) {
  if (!prev || prev.length === 0) {
    const runs = DEMO_AGENT_DEFS.map((def) => makeRun(def));
    return startAgent(runs, 0);
  }

  const runs = prev.map((r) => ({ ...r, tasks: r.tasks.map((t) => ({ ...t })) }));
  const runningIdx = runs.findIndex((r) => r.status === "running");

  if (runningIdx !== -1) {
    const run = runs[runningIdx];
    const nextTask = run.tasks.findIndex((t) => !t.done);
    if (nextTask !== -1) {
      run.tasks[nextTask].done = true;
      return runs;
    }
    run.status = "done";
    run.finishedAt = Date.now();
    const nextIdx = runs.findIndex(
      (r, i) => i > runningIdx && r.status === "pending" && !r.isSubAgent
    );
    if (nextIdx !== -1) return startAgent(runs, nextIdx);
    return runs;
  }

  return runs;
}

export function approveDemoRun(prev) {
  const runs = prev.map((r) => ({ ...r, tasks: r.tasks.map((t) => ({ ...t })) }));
  const gateIdx = runs.findIndex((r) => r.status === "waiting_human");
  if (gateIdx === -1) return runs;
  const run = runs[gateIdx];
  run.status = "done";
  run.finishedAt = Date.now();
  const nextIdx = runs.findIndex(
    (r, i) => i > gateIdx && r.status === "pending" && !r.isSubAgent
  );
  if (nextIdx !== -1) return startAgent(runs, nextIdx);
  return runs;
}

export function durationSec(run) {
  if (!run.startedAt || !run.finishedAt) return null;
  const diff = Math.max(0, run.finishedAt - run.startedAt);
  return (diff / 1000).toFixed(1);
}
