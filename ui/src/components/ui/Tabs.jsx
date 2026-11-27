import React from "react";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { cn } from "@/utils/cn.js";

export function SegmentedTabs({ value, onChange, items = [], ariaLabel = "View tabs", className }) {
  return (
    <BaseTabs.Root value={value} onValueChange={onChange}>
      <BaseTabs.List
        aria-label={ariaLabel}
        className={cn(
          "inline-flex flex-wrap items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-subtle)] p-0.5",
          className
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = value === item.value;
          return (
            <BaseTabs.Tab
              key={item.value}
              value={item.value}
              disabled={item.disabled}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-xs font-semibold transition-colors duration-150 cursor-pointer select-none",
                active
                  ? "bg-[var(--bg-surface)] text-[var(--brand)] shadow-[var(--shadow-xs)] border border-[var(--border-default)] etl-active-ring"
                  : "border border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                item.disabled && "opacity-45 cursor-not-allowed"
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              <span>{item.label}</span>
              {item.count !== undefined && (
                <span className="tabular-nums text-[var(--text-muted)]">({item.count})</span>
              )}
            </BaseTabs.Tab>
          );
        })}
      </BaseTabs.List>
    </BaseTabs.Root>
  );
}

export default SegmentedTabs;
