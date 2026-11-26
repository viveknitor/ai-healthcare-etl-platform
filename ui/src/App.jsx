import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import SidebarNav from "./components/layout/SidebarNav.jsx";
import TopHeader from "./components/layout/TopHeader.jsx";
import OverviewDashboardPage from "./pages/OverviewDashboardPage.jsx";
import PipelinePage from "./pages/PipelinePage.jsx";
import MappingPage from "./pages/MappingPage.jsx";
import UploadPage from "./pages/UploadPage.jsx";

export default function App() {
  const [tab, setTab] = useState("overview");
  const [online, setOnline] = useState(null);
  const [stats, setStats] = useState(null);
  const [infra, setInfra] = useState(null);
  const [telemetryLoading, setTelemetryLoading] = useState(true);
  const [refreshingTelemetry, setRefreshingTelemetry] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const loadTelemetry = useCallback(async (forceInfraRefresh = false) => {
    if (forceInfraRefresh) {
      setRefreshingTelemetry(true);
    }
    try {
      const [healthRes, statsRes, infraRes] = await Promise.allSettled([
        api.health(),
        api.getDashboardStats(),
        api.getInfrastructureStatus(forceInfraRefresh),
      ]);

      const isHealthy = healthRes.status === "fulfilled";
      setOnline(isHealthy);
      if (statsRes.status === "fulfilled" && statsRes.value) {
        setStats(statsRes.value);
      }
      if (infraRes.status === "fulfilled" && infraRes.value) {
        setInfra(infraRes.value);
      } else if (!isHealthy) {
        setInfra(null);
      }
    } finally {
      setTelemetryLoading(false);
      setRefreshingTelemetry(false);
    }
  }, []);

  useEffect(() => {
    loadTelemetry(false);
  }, [loadTelemetry]);

  useEffect(() => {
    if (tab === "overview") {
      loadTelemetry(false);
    }
  }, [tab, loadTelemetry]);

  useEffect(() => {
    const id = setInterval(() => {
      loadTelemetry(false);
    }, 30000);
    return () => clearInterval(id);
  }, [loadTelemetry]);

  return (
    <div className={`enterprise-app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* 1. Modern Enterprise Collapsible Sidebar */}
      <SidebarNav
        activeTab={tab}
        onSelectTab={setTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        infra={infra}
      />

      {/* 2. Main Workspace Layout */}
      <div className="workspace-main-container">
        {/* Top Header with Breadcrumbs & Status */}
        <TopHeader
          activeTab={tab}
          online={online}
          infra={infra}
        />

        {/* Content Area */}
        <main className="workspace-content-pane">
          {tab === "overview" && (
            <OverviewDashboardPage
              onNavigate={setTab}
              online={online}
              stats={stats}
              infra={infra}
              loading={telemetryLoading}
              refreshing={refreshingTelemetry}
              onRefresh={() => loadTelemetry(true)}
            />
          )}
          {tab === "upload" && <UploadPage />}
          {tab === "pipeline" && <PipelinePage />}
          {tab === "mapping" && <MappingPage />}
        </main>
      </div>
    </div>
  );
}
