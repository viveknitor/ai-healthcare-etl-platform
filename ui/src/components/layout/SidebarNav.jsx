import React from "react";

export const NAV_ITEMS = [
  { id: "overview", label: "Executive Dashboard", icon: "📊", badge: "Live", sub: "Operational Metrics & Health" },
  { id: "upload", label: "Direct Ingestion Hub", icon: "📁", badge: "4-Step", sub: "CSV, Excel & PlanData ETL" },
  { id: "pipeline", label: "FHIR Live Sync", icon: "🔄", badge: "Sync", sub: "HAPI to Medplum Pipeline" },
  { id: "mapping", label: "AI Mapping Studio", icon: "✨", badge: "Gemini", sub: "Autonomous Schema Contracts" },
];

export default function SidebarNav({ activeTab, onSelectTab, isCollapsed, onToggleCollapse }) {
  return (
    <aside className={`app-sidebar ${isCollapsed ? "collapsed" : ""}`}>
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="brand-icon-box">⚡</div>
        {!isCollapsed && (
          <div className="brand-text-container">
            <h1 className="brand-title">SmartHealth ETL</h1>
            <span className="brand-sub">FHIR R4 • Autonomous Core</span>
          </div>
        )}
      </div>

      {/* Navigation List */}
      <nav className="sidebar-nav">
        <div className="nav-group-title">{!isCollapsed ? "PLATFORM NAVIGATION" : "•••"}</div>
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`sidebar-nav-item ${isActive ? "active" : ""}`}
              onClick={() => onSelectTab(item.id)}
              title={isCollapsed ? item.label : undefined}
            >
              <span className="nav-item-icon">{item.icon}</span>
              {!isCollapsed && (
                <div className="nav-item-content">
                  <div className="nav-item-label-row">
                    <span className="nav-item-label">{item.label}</span>
                    {item.badge && <span className={`nav-item-badge ${isActive ? "active" : ""}`}>{item.badge}</span>}
                  </div>
                  <span className="nav-item-sub">{item.sub}</span>
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Server Status Indicators (Bottom of Sidebar) */}
      <div className="sidebar-footer">
        {!isCollapsed && (
          <div className="sidebar-health-summary">
            <div className="health-row">
              <span className="status-dot ok" />
              <span className="health-label">Medplum :8103</span>
              <span className="health-val">Active</span>
            </div>
            <div className="health-row">
              <span className="status-dot ok" style={{ background: "#c084fc", boxShadow: "0 0 6px #c084fc" }} />
              <span className="health-label">Gemini 2.5 Flash</span>
              <span className="health-val">AI Ready</span>
            </div>
          </div>
        )}

        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? "→" : "← Collapse Sidebar"}
        </button>
      </div>
    </aside>
  );
}

