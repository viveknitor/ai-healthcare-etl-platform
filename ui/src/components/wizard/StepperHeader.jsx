import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/utils/cn.js";

export const WIZARD_STEPS = [
  { step: 1, title: "Upload" },
  { step: 2, title: "Mapping" },
  { step: 3, title: "Validate" },
  { step: 4, title: "Deliver" },
];

export default function StepperHeader({ currentStep, onSelectStep, maxUnlockedStep = 1 }) {
  return (
    <nav
      aria-label="Ingestion workflow steps"
      className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-3.5 shadow-[var(--shadow-xs)]"
    >
      <ol className="m-0 flex flex-wrap items-center justify-between gap-2 list-none p-0">
        {WIZARD_STEPS.map((s, idx) => {
          const isCurrent = currentStep === s.step;
          const isCompleted = currentStep > s.step;
          const isUnlocked = s.step <= maxUnlockedStep;

          return (
            <React.Fragment key={s.step}>
              <li className="shrink-0">
                <button
                  type="button"
                  disabled={!isUnlocked}
                  aria-current={isCurrent ? "step" : undefined}
                  title={!isUnlocked ? "Complete previous steps to unlock" : undefined}
                  onClick={() => isUnlocked && onSelectStep(s.step)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors duration-150",
                    isUnlocked ? "cursor-pointer" : "cursor-not-allowed opacity-55"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums transition-colors",
                      isCurrent
                        ? "border-[#161b33] bg-[#161b33] text-white ring-4 ring-slate-900/10"
                        : isCompleted
                        ? "border-[var(--ok)] bg-[var(--ok)] text-white"
                        : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-muted)]"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      s.step
                    )}
                  </span>

                  <span
                    className={cn(
                      "text-[13px] whitespace-nowrap",
                      isCurrent
                        ? "font-bold text-[var(--text-primary)]"
                        : isCompleted
                        ? "font-semibold text-[var(--text-secondary)]"
                        : "font-medium text-[var(--text-muted)]"
                    )}
                  >
                    {s.step}. {s.title}
                  </span>
                </button>
              </li>

              {idx < WIZARD_STEPS.length - 1 && (
                <li aria-hidden="true" className="hidden sm:block h-px flex-1 min-w-[20px] bg-[var(--border-default)]" />
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
