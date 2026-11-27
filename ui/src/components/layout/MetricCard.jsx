import React from "react";
import Badge from "@/components/ui/Badge.jsx";
import { cn } from "@/utils/cn.js";

const VALUE_TONE_CLASS = {
  ok: "text-[var(--ok)]",
  brand: "text-[var(--brand)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
  ai: "text-[var(--ai)]",
  neutral: "text-[var(--text-primary)]",
};

export default function MetricCard({
  title,
  value,
  subvalue,
  icon: Icon,
  badge,
  badgeType = "neutral", // "ok" | "bad" | "warn" | "info" | "brand" | "ai" | "neutral"
  trend,
  tone = "neutral",
  loading = false,
  onClick,
}) {
  const Comp = onClick ? "button" : "div";

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex flex-col justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 text-left shadow-[var(--shadow-sm)]",
        onClick &&
          "cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--text-muted)]">{title}</span>
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2 py-1" aria-busy="true">
          <div className="h-7 w-24 rounded bg-[var(--bg-muted)]" />
          <div className="h-3.5 w-32 rounded bg-[var(--bg-subtle)]" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className={cn("text-2xl font-bold tracking-tight tabular-nums", VALUE_TONE_CLASS[tone] || VALUE_TONE_CLASS.neutral)}>
              {value}
            </span>
            {badge && <Badge tone={badgeType}>{badge}</Badge>}
          </div>

          {(subvalue || trend) && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)] tabular-nums">
              {trend && (
                <span
                  className={cn(
                    "font-semibold",
                    trend.startsWith("+") ? "text-[var(--ok)]" : "text-[var(--warn)]"
                  )}
                >
                  {trend}
                </span>
              )}
              {subvalue && <span>{subvalue}</span>}
            </div>
          )}
        </>
      )}
    </Comp>
  );
}
