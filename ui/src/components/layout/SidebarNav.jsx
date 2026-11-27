import React from "react";
import {
  Activity,
  LayoutDashboard,
  Rocket,
  ArrowLeftRight,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAppStore } from "@/stores/useAppStore.js";
import { cn } from "@/utils/cn.js";

export const NAV_GROUPS = [
  {
    heading: "Ingest",
    items: [
      { id: "overview", label: "Dashboard", icon: LayoutDashboard },
      { id: "upload", label: "New Ingestion", icon: Rocket },
    ],
  },
  {
    heading: "Operations",
    items: [
      { id: "pipeline", label: "Live Sync", icon: ArrowLeftRight },
      { id: "mapping", label: "Mapping Studio", icon: Sparkles },
    ],
  },
];

export default function SidebarNav({ activeTab, onSelectTab, isCollapsed, onToggleCollapse }) {
  const servicesHealth = useAppStore((s) => s.servicesHealth);
  const backendOnline = useAppStore((s) => s.backendOnline);
  const medplumOnline = servicesHealth?.medplum?.status === "ok";

  return (
    <aside
      className={cn(
        "sticky top-0 z-[var(--z-sidebar)] flex h-dvh shrink-0 flex-col justify-between bg-[var(--bg-sidebar)] text-[var(--sidebar-text)] transition-[width] duration-200 ease-[var(--ease-out-ui)]",
        isCollapsed ? "w-[68px]" : "w-[232px]"
      )}
    >
      <div>
        {/* Minimal Brand Header */}
        <div
          className={cn(
            "flex items-center gap-2.5 px-5 py-5",
            isCollapsed && "justify-center px-0"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/12 text-white">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-base font-bold tracking-tight text-white" translate="no">
                SmartHealth
              </div>
              <span className="block truncate text-[10px] font-medium tracking-wide text-[var(--sidebar-muted)]">
                FHIR R4
              </span>
            </div>
          )}
        </div>

        {/* Clean Grouped Navigation */}
        <nav aria-label="Primary navigation" className="space-y-5 px-3 pt-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading} className="space-y-1">
              {!isCollapsed && (
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--sidebar-muted)]">
                  {group.heading}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    title={isCollapsed ? item.label : undefined}
                    aria-label={isCollapsed ? item.label : undefined}
                    onClick={() => onSelectTab(item.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium transition-colors duration-150 cursor-pointer",
                      isActive
                        ? "border-[var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] text-white font-semibold"
                        : "border-transparent bg-transparent text-[var(--sidebar-text)] hover:bg-white/6 hover:text-white",
                      isCollapsed && "justify-center px-0"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden="true" />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Minimal Footer */}
      <div className="space-y-2 border-t border-[var(--sidebar-border)] p-3">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 rounded-lg bg-white/6 px-3 py-2.5 text-xs">
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                backendOnline === true
                  ? medplumOnline
                    ? "bg-emerald-400"
                    : "bg-amber-400"
                  : backendOnline === false
                  ? "bg-rose-400"
                  : "bg-slate-400"
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 leading-tight">
              <div className="truncate font-medium text-white">
                {backendOnline === true
                  ? medplumOnline
                    ? "Online"
                    : "Medplum Off"
                  : backendOnline === false
                  ? "Offline"
                  : "Connecting…"}
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-[32px] w-full items-center justify-center gap-2 rounded-lg border border-[var(--sidebar-border)] bg-transparent px-2.5 text-xs font-medium text-[var(--sidebar-text)] hover:bg-white/8 hover:text-white cursor-pointer"
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
