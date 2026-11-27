import React from "react";
import { ArrowRight, Download, Upload, Cpu } from "lucide-react";
import AppDialog from "@/components/ui/Dialog.jsx";
import Badge from "@/components/ui/Badge.jsx";

export default function AgentDossierDialog({ agent, onClose }) {
  const Icon = agent?.icon;
  return (
    <AppDialog
      open={Boolean(agent)}
      onClose={onClose}
      maxWidth="680px"
      title={
        agent ? (
          <span className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-[var(--brand)]" aria-hidden="true" />}
            <span>
              {agent.codename} (Agent {agent.num})
            </span>
          </span>
        ) : (
          "Agent Dossier"
        )
      }
      subtitle={
        agent ? `${agent.archetype} • Engine: ${agent.engine}` : undefined
      }
    >
      {agent && (
        <div className="space-y-4">
          <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4 space-y-1.5">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--brand)]">
              Core Mission &amp; Scope
            </div>
            <p className="m-0 text-xs leading-relaxed text-[var(--text-primary)]">
              {agent.mission}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-bg)]/60 p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--brand)]">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Input Artifact Received</span>
              </div>
              <div className="text-xs text-[var(--text-primary)]">{agent.inputReceived}</div>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--ok-border)] bg-[var(--ok-bg)]/60 p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--ok)]">
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Handoff Artifact Produced</span>
              </div>
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                {agent.handoffOutput}
              </div>
              <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
                <span>Passes to: {agent.passesTo}</span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Processing Logic &amp; Enforcement</span>
            </div>
            <p className="m-0 text-xs leading-relaxed text-[var(--text-secondary)]">
              {agent.action}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-subtle)] px-3.5 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">Status:</span>
              <Badge tone={agent.done ? "ok" : agent.active ? "brand" : "warn"}>
                {agent.status}
              </Badge>
            </div>
            <div className="tabular-nums text-[var(--text-secondary)]">
              Telemetry: <strong className="text-[var(--text-primary)]">{agent.metrics}</strong>
            </div>
          </div>
        </div>
      )}
    </AppDialog>
  );
}
