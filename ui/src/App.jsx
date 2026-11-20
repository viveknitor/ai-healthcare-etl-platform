import { useEffect, useState } from "react";
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    api.health().then(() => setOnline(true)).catch(() => setOnline(false));
  }, []);

  return (
    <div className={`enterprise-app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* 1. Modern Enterprise Collapsible Sidebar */}
      <SidebarNav
        activeTab={tab}
        onSelectTab={setTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* 2. Main Workspace Layout */}
      <div className="workspace-main-container">
        {/* Top Header with Breadcrumbs & Status */}
        <TopHeader
          activeTab={tab}
          online={online}
        />

        {/* Content Area */}
        <main className="workspace-content-pane">
          {tab === "overview" && (
            <OverviewDashboardPage onNavigate={setTab} online={online} />
          )}
          {tab === "upload" && <UploadPage />}
          {tab === "pipeline" && <PipelinePage />}
          {tab === "mapping" && <MappingPage />}
        </main>
      </div>
    </div>
  );
}
