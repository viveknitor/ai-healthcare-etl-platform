import React from "react";
import {
  ShieldCheck,
  Zap,
  Wrench,
  Gauge,
  UploadCloud,
  ArrowLeftRight,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { useAppStore } from "@/stores/useAppStore.js";
import MetricCard from "@/components/layout/MetricCard.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";

export default function OverviewDashboardPage({ onNavigate, online }) {
  const overviewStats = useAppStore((s) => s.overviewStats);
  const statsLoading = useAppStore((s) => s.statsLoading);
  const statsError = useAppStore((s) => s.statsError);
  const refreshHealthAndStats = useAppStore((s) => s.refreshHealthAndStats);

  return (
    <div className="space-y-6">
      {/* 1. Hero Banner */}
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-sm)]">
        <div className="space-y-2 max-w-2xl">
          <Badge tone={online ? "ok" : "warn"} icon={ShieldCheck}>
            HL7 FHIR R4 Enterprise Interoperability System
          </Badge>
          <h2 className="m-0 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Clinical Data Ingestion &amp; Reconciliation
          </h2>
          <p className="m-0 text-sm text-[var(--text-muted)] clinical-prose">
            Autonomous multi-agent ETL pipeline reconciling PlanData, Excel, CSV, and HAPI FHIR feeds into Medplum with human-governed mapping contracts and zero data loss.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" onClick={() => onNavigate("upload")}>
            <UploadCloud className="h-4 w-4" aria-hidden="true" />
            <span>Ingest New Data File</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="secondary" onClick={() => onNavigate("pipeline")}>
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
            <span>Run HAPI Sync</span>
          </Button>
        </div>
      </div>

      {/* Backend Offline Notice (never hidden behind silent fake numbers) */}
      {statsError && !overviewStats && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--warn-border)] bg-[var(--warn-bg)] px-4 py-3 text-xs"
        >
          <div className="flex items-center gap-2 font-semibold text-[var(--warn)]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{statsError}. Live KPI telemetry will populate once FastAPI responds.</span>
          </div>
          <Button size="sm" variant="secondary" onClick={refreshHealthAndStats}>
            Retry Connection
          </Button>
        </div>
      )}

      {/* 2. Top Executive KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Clinical Quality Rate"
          value={overviewStats ? `${overviewStats.quality_rate}%` : "—"}
          subvalue={
            overviewStats
              ? `${overviewStats.valid_records?.toLocaleString()} valid / ${overviewStats.invalid_records || 0} quarantined`
              : "Awaiting telemetry"
          }
          badge={overviewStats?.quality_rate >= 99 ? "Certified" : "Monitored"}
          badgeType="ok"
          tone="ok"
          icon={ShieldCheck}
          loading={statsLoading && !overviewStats}
        />

        <MetricCard
          title="Records Processed"
          value={overviewStats ? overviewStats.records_processed_formatted : "—"}
          subvalue={
            overviewStats
              ? `${overviewStats.total_runs || 0} runs • ${overviewStats.delivered_records?.toLocaleString() || 0} persisted`
              : "Awaiting telemetry"
          }
          badge={overviewStats?.total_runs > 0 ? "Active" : "Idle"}
          badgeType="brand"
          tone="brand"
          icon={Zap}
          loading={statsLoading && !overviewStats}
        />

        <MetricCard
          title="AI Auto-Healed Rules"
          value={overviewStats ? String(overviewStats.auto_healed_rules ?? 0) : "—"}
          subvalue={
            overviewStats?.last_llm_model
              ? `${overviewStats.llm_calls || 0} LLM calls • ${overviewStats.total_llm_cost_formatted || "$0.00"}`
              : "Closed-loop schema repair"
          }
          badge="Gemini Flash"
          badgeType="ai"
          tone="ai"
          icon={Wrench}
          loading={statsLoading && !overviewStats}
        />

        <MetricCard
          title="Peak Delivery Velocity"
          value={overviewStats ? `${overviewStats.delivery_velocity ?? 0} rec/s` : "—"}
          subvalue={
            overviewStats
              ? `Last batch: ${overviewStats.last_velocity_rec_per_sec ?? 0} rec/s`
              : "SSE adaptive pacing"
          }
          badge="SSE Stream"
          badgeType="neutral"
          tone="neutral"
          icon={Gauge}
          loading={statsLoading && !overviewStats}
        />
      </div>
    </div>
  );
}
