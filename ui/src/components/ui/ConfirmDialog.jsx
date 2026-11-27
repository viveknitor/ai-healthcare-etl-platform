import React from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore.js";
import Button from "./Button.jsx";

export function ConfirmDialogHost() {
  const req = useAppStore((s) => s.confirmRequest);
  const resolveConfirm = useAppStore((s) => s.resolveConfirm);

  if (!req) return null;

  const isDanger = req.tone === "danger";
  const isSuccess = req.tone === "success";

  return (
    <AlertDialog.Root
      open={Boolean(req)}
      onOpenChange={(open) => {
        if (!open) resolveConfirm(false);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="etl-dialog-backdrop" />
        <AlertDialog.Viewport className="etl-dialog-backdrop">
          <AlertDialog.Popup className="etl-dialog-popup" style={{ maxWidth: "500px" }}>
            <div className="flex items-start gap-3 border-b border-[var(--border-default)] bg-[var(--bg-subtle)]/60 px-5 py-4">
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                  isDanger
                    ? "bg-[var(--bad-bg)] border-[var(--bad-border)] text-[var(--bad)]"
                    : "bg-[var(--warn-bg)] border-[var(--warn-border)] text-[var(--warn)]"
                }`}
              >
                {isDanger ? (
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <AlertDialog.Title className="m-0 text-base font-bold text-[var(--text-primary)]">
                  {req.title || "Confirm Action"}
                </AlertDialog.Title>
                <AlertDialog.Description className="m-0 mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                  {req.description}
                </AlertDialog.Description>
              </div>
            </div>

            {req.details && (
              <div className="px-5 py-3 text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)]">
                {req.details}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-[var(--border-default)] bg-[var(--bg-subtle)]/40 px-5 py-3">
              <Button
                variant="secondary"
                autoFocus
                onClick={() => resolveConfirm(false)}
              >
                {req.cancelLabel || "Cancel"}
              </Button>
              <Button
                variant={isDanger ? "danger" : isSuccess ? "success" : "primary"}
                onClick={() => resolveConfirm(true)}
              >
                {req.confirmLabel || "Confirm"}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export default ConfirmDialogHost;
