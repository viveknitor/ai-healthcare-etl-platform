import React from "react";

export const WIZARD_STEPS = [
  { step: 1, title: "Source Intake", sub: "Upload & Preview Data", icon: "📥" },
  { step: 2, title: "Mapping Contract", sub: "AI Schema Synthesis", icon: "✨" },
  { step: 3, title: "Quality Gate", sub: "Validation & Auto-Heal", icon: "🛡️" },
  { step: 4, title: "Ingest & Audit", sub: "Delivery & Reconciliation", icon: "⚡" },
];

export default function StepperHeader({ currentStep, onSelectStep, maxUnlockedStep = 1 }) {
  return (
    <div className="wizard-stepper-container">
      <div className="wizard-stepper-track">
        {WIZARD_STEPS.map((s, idx) => {
          const isCurrent = currentStep === s.step;
          const isCompleted = currentStep > s.step;
          const isUnlocked = s.step <= maxUnlockedStep;

          return (
            <React.Fragment key={s.step}>
              <div
                className={`wizard-step-node ${isCurrent ? "current" : ""} ${isCompleted ? "completed" : ""} ${!isUnlocked ? "locked" : ""}`}
                onClick={() => isUnlocked && onSelectStep(s.step)}
                title={!isUnlocked ? "Complete previous steps to unlock" : undefined}
              >
                <div className="step-circle">
                  {isCompleted ? "✓" : s.icon}
                </div>
                <div className="step-text-wrap">
                  <span className="step-number">STEP {s.step}</span>
                  <span className="step-title">{s.title}</span>
                  <span className="step-sub">{s.sub}</span>
                </div>
              </div>

              {idx < WIZARD_STEPS.length - 1 && (
                <div className={`wizard-step-connector ${currentStep > s.step ? "active" : ""}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
