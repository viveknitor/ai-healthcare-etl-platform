import React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/utils/cn.js";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums",
  {
    variants: {
      tone: {
        neutral: "bg-[var(--bg-subtle)] border-[var(--border-default)] text-[var(--text-secondary)]",
        brand: "bg-[var(--brand-bg)] border-[var(--brand-border)] text-[var(--brand)]",
        ok: "bg-[var(--ok-bg)] border-[var(--ok-border)] text-[var(--ok)]",
        warn: "bg-[var(--warn-bg)] border-[var(--warn-border)] text-[var(--warn)]",
        bad: "bg-[var(--bad-bg)] border-[var(--bad-border)] text-[var(--bad)]",
        info: "bg-[var(--info-bg)] border-[var(--info-border)] text-[var(--info)]",
        ai: "bg-[var(--ai-bg)] border-[var(--ai-border)] text-[var(--ai)]",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
);

export function Badge({ tone = "neutral", icon: Icon, className, children, ...props }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}

export default Badge;
