import React, { useState, useEffect } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X, AlertTriangle } from "lucide-react";
import Button from "./Button.jsx";
import { cn } from "@/utils/cn.js";

export function AppDialog({
  open,
  onClose,
  title,
  subtitle,
  headerRight,
  footer,
  maxWidth = "780px",
  dirty = false,
  sheetOnMobile = true,
  children,
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!open) setConfirmDiscard(false);
  }, [open]);

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) {
      if (dirty && !confirmDiscard) {
        setConfirmDiscard(true);
        return;
      }
      setConfirmDiscard(false);
      onClose?.();
    }
  };

  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={handleOpenChange}
      disablePointerDismissal={dirty}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="etl-dialog-backdrop" />
        <BaseDialog.Viewport className="etl-dialog-backdrop">
          <BaseDialog.Popup
            className="etl-dialog-popup"
            data-sheet-mobile={sheetOnMobile ? "true" : "false"}
            style={{ maxWidth }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border-default)] bg-[var(--bg-subtle)]/60 px-5 py-4">
              <div className="min-w-0 flex-1">
                <BaseDialog.Title className="m-0 text-base font-bold text-[var(--text-primary)]">
                  {title}
                </BaseDialog.Title>
                {subtitle && (
                  <BaseDialog.Description className="m-0 mt-0.5 text-xs text-[var(--text-muted)]">
                    {subtitle}
                  </BaseDialog.Description>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {headerRight}
                <BaseDialog.Close
                  render={
                    <Button variant="secondary" size="sm" aria-label="Close dialog">
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Close</span>
                    </Button>
                  }
                />
              </div>
            </div>

            {/* Unsaved changes confirmation guard inside dialog (prevents stacked dialogs) */}
            {confirmDiscard && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--warn-border)] bg-[var(--warn-bg)] px-5 py-3 text-xs"
              >
                <div className="flex items-center gap-2 font-semibold text-[var(--warn)]">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>You have unsaved edits. Discard changes and close?</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setConfirmDiscard(false)}>
                    Keep Editing
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setConfirmDiscard(false);
                      onClose?.();
                    }}
                  >
                    Discard &amp; Close
                  </Button>
                </div>
              </div>
            )}

            {/* Scrollable Body */}
            <div className={cn("flex-1 overflow-y-auto px-5 py-4 overscroll-contain")}>
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-default)] bg-[var(--bg-subtle)]/40 px-5 py-3">
                {footer}
              </div>
            )}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export default AppDialog;
