import React, { Suspense, lazy, useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import { useAppStore } from "@/stores/useAppStore.js";
import SidebarNav from "@/components/layout/SidebarNav.jsx";
import TopHeader from "@/components/layout/TopHeader.jsx";
import ConfirmDialogHost from "@/components/ui/ConfirmDialog.jsx";
import RegionErrorBoundary from "@/components/ui/RegionErrorBoundary.jsx";

const OverviewDashboardPage = lazy(() => import("@/pages/OverviewDashboardPage.jsx"));
const UploadPage = lazy(() => import("@/pages/UploadPage.jsx"));
const PipelinePage = lazy(() => import("@/pages/PipelinePage.jsx"));
const MappingPage = lazy(() => import("@/pages/MappingPage.jsx"));

function WorkspaceFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading workspace">
      <div className="h-28 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
        <div className="h-5 w-48 rounded bg-[var(--bg-muted)]" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-[var(--bg-subtle)]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((k) => (
          <div
            key={k}
            className="h-28 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
          >
            <div className="h-4 w-28 rounded bg-[var(--bg-subtle)]" />
            <div className="mt-4 h-7 w-20 rounded bg-[var(--bg-muted)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const syncTabFromUrl = useAppStore((s) => s.syncTabFromUrl);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const backendOnline = useAppStore((s) => s.backendOnline);
  const refreshHealthAndStats = useAppStore((s) => s.refreshHealthAndStats);

  useEffect(() => {
    syncTabFromUrl();
    refreshHealthAndStats();
    const onPopState = () => syncTabFromUrl();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [syncTabFromUrl, refreshHealthAndStats]);

  return (
    <MotionConfig reducedMotion="user">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[var(--z-toast)] focus:rounded-[var(--radius-sm)] focus:bg-[var(--brand)] focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-[var(--brand-fg)]"
      >
        Skip to main content
      </a>

      <div className="flex min-h-dvh bg-[var(--bg-canvas)] text-[var(--text-primary)]">
        <SidebarNav
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopHeader activeTab={activeTab} online={backendOnline} />

          <main id="main-content" tabIndex={-1} className="flex-1 p-6">
            <div className="mx-auto max-w-[1360px]">
              <RegionErrorBoundary key={activeTab} title="Workspace view failed to render">
                <Suspense fallback={<WorkspaceFallback />}>
                  {activeTab === "overview" && (
                    <OverviewDashboardPage onNavigate={setActiveTab} online={backendOnline} />
                  )}
                  {activeTab === "upload" && <UploadPage />}
                  {activeTab === "pipeline" && <PipelinePage />}
                  {activeTab === "mapping" && <MappingPage />}
                </Suspense>
              </RegionErrorBoundary>
            </div>
          </main>
        </div>
      </div>

      <ConfirmDialogHost />
      <Toaster
        position="bottom-right"
        theme="light"
        richColors
        visibleToasts={3}
        closeButton
      />
    </MotionConfig>
  );
}
