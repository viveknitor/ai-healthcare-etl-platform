import React from "react";

export default function MetricCard({
  title,
  value,
  subvalue,
  icon,
  badge,
  badgeType = "ok", // "ok" | "bad" | "warn" | "info" | "brand"
  trend,
  color = "var(--brand)",
  onClick,
}) {
  return (
    <div
      className="metric-card"
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : "default",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
        <span className="metric-title">{title}</span>
        {icon && (
          <div
            className="metric-icon-box"
            style={{
              background: `rgba(255, 255, 255, 0.05)`,
              color: color,
              border: `1px solid rgba(255, 255, 255, 0.1)`,
            }}
          >
            {icon}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
        <span className="metric-value" style={{ color }}>{value}</span>
        {badge && (
          <span className={`chip ${badgeType}`} style={{ fontSize: "11px", fontWeight: 600 }}>
            {badge}
          </span>
        )}
      </div>

      {(subvalue || trend) && (
        <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
          {trend && <span style={{ color: trend.startsWith("+") ? "var(--ok)" : "var(--warn)", fontWeight: 600 }}>{trend}</span>}
          {subvalue && <span>{subvalue}</span>}
        </div>
      )}

      {/* Decorative gradient corner glow */}
      <div
        style={{
          position: "absolute",
          right: "-20px",
          bottom: "-20px",
          width: "80px",
          height: "80px",
          background: color,
          opacity: 0.06,
          filter: "blur(24px)",
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

