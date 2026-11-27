import React from "react";
import { Inbox, SearchX, AlertTriangle } from "lucide-react";
import Button from "./Button.jsx";

export function EmptyState({
  variant = "first-run", // "first-run" | "filtered" | "error"
  icon: CustomIcon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryAction,
}) {
  const Icon =
    CustomIcon ||
    (variant === "error" ? AlertTriangle : variant === "filtered" ? SearchX : Inbox);

  const iconTone =
    variant === "error"
      ? "border-[var(--bad-border)] bg-[var(--bad-bg)] text-[var(--bad)]"
      : "border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-muted)]";

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-subtle)]/50 px-6 py-8 text-center">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${iconTone}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="space-y-1 max-w-md">
        <div className="text-sm font-bold text-[var(--text-primary)]">{title}</div>
        {description && (
          <p className="m-0 text-xs text-[var(--text-muted)] clinical-prose">{description}</p>
        )}
      </div>
      {(actionLabel || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {actionLabel && onAction && (
            <Button
              variant={variant === "first-run" ? "primary" : "secondary"}
              size="sm"
              onClick={onAction}
            >
              {actionLabel}
            </Button>
          )}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
