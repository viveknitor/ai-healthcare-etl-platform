import React from "react";
import { cn } from "@/utils/cn.js";

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[var(--shadow-sm)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ as: Comp = "h2", className, children, ...props }) {
  return (
    <Comp className={cn("m-0 text-base font-bold tracking-tight text-[var(--text-primary)]", className)} {...props}>
      {children}
    </Comp>
  );
}

export function CardDescription({ className, children, ...props }) {
  return (
    <p className={cn("m-0 mt-0.5 text-xs text-[var(--text-muted)] clinical-prose", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }) {
  return (
    <div className={cn("p-5", className)} {...props}>
      {children}
    </div>
  );
}

export default Card;
