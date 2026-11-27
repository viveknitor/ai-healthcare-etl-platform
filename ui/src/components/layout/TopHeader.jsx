import React from "react";
import { RefreshCw, Layers } from "lucide-react";
import { TAB_META, useAppStore } from "@/stores/useAppStore.js";
import { cn } from "@/utils/cn.js";

export default function TopHeader({ activeTab, online }) {
  const activeBatch = useAppStore((s) => s.activeBatch);
  const servicesHealth = useAppStore((s) => s.servicesHealth);
  const statsLoading = useAppStore((s) => s.statsLoading);
  const refreshHealthAndStats = useAppStore((s) => s.refreshHealthAndStats);

  const meta = TAB_META[activeTab] || TAB_META.overview;
  const medplumOnline = servicesHealth?.medplum?.status === "ok";

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] flex h-[56px] items-center justify-between gap-4 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-6">
      <h1 className="m-0 truncate text-[16px] font-bold tracking-tight text-[var(--text-primary)]">
        {meta.headerTitle}
      </h1>

      <div className="flex items-center gap-2.5">
        {activeBatch?.datasetName && (
          <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-1 text-xs font-medium text-[var(--brand)]">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{activeBatch.datasetName}</span>
            {activeBatch.rowCount !== undefined && (
              <span className="tabular-nums opacity-75">({activeBatch.rowCount})</span>
            )}
          </div>
        )}

        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1 text-xs text-[var(--text-secondary)] shadow-[var(--shadow-xs)]">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              online === true
                ? medplumOnline
                  ? "bg-emerald-500"
                  : "bg-amber-500"
                : online === false
                ? "bg-rose-500"
                : "bg-slate-400"
            )}
            aria-hidden="true"
          />
          <span className="font-medium">
            {online === null
              ? "Connecting…"
              : online
              ? medplumOnline
                ? "FHIR :8103"
                : "API :8000"
              : "Offline"}
          </span>
          <button
            type="button"
            disabled={statsLoading}
            onClick={() => refreshHealthAndStats()}
            aria-label="Refresh service health and metrics"
            title="Refresh status"
            className="ml-0.5 inline-flex items-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", statsLoading && "animate-spin")} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
