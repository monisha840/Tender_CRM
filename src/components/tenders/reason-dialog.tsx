"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Bottom sheet that collects a reason (or an optional note) before a recorded action.
 * `onConfirm` returns an error message to keep the sheet open, or nothing to close it.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label = "Reason",
  required = true,
  placeholder,
  confirmLabel,
  testId,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  confirmLabel: string;
  /** Prefix: textarea `<id>-reason`, confirm button `<id>-confirm`. */
  testId: string;
  onConfirm: (reason: string) => Promise<string | void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const missing = required && reason.trim().length < 3;

  async function confirm() {
    if (missing || busy) return;
    setBusy(true);
    setError(null);
    try {
      const msg = await onConfirm(reason.trim());
      if (msg) setError(msg);
      else {
        setReason("");
        onOpenChange(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-xl p-4 sm:max-w-lg">
        <SheetHeader className="p-0">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <label className="block text-sm font-medium" htmlFor={`${testId}-reason`}>
          {label} {required ? <span className="text-status-danger">(required)</span> : <span className="text-muted-foreground">(optional)</span>}
        </label>
        <textarea
          id={`${testId}-reason`}
          data-testid={`${testId}-reason`}
          value={reason}
          onChange={(e) => {
            setError(null);
            setReason(e.target.value);
          }}
          rows={4}
          placeholder={placeholder}
          className="w-full rounded-md border bg-surface p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
        />
        {error && (
          <p role="alert" className="rounded-md bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </p>
        )}
        <SheetFooter className="p-0">
          <Button className="min-h-11" disabled={missing || busy} onClick={confirm} data-testid={`${testId}-confirm`}>
            {busy ? "Saving…" : confirmLabel}
          </Button>
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
