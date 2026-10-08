"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { moveItem, moveToIndex } from "@/modules/settings/reorder";
import type { ActionResult } from "@/lib/server/service";

/** Runs a server action, toasts the outcome, refreshes server data, and exposes field errors for inline display. */
export function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  async function run<T>(fn: () => Promise<ActionResult<T>>, okMessage: string): Promise<boolean> {
    setError(null);
    setFieldErrors({});
    let result: ActionResult<T>;
    try {
      result = await fn();
    } catch {
      result = { ok: false, error: { code: "INTERNAL", message: "Could not reach the server. Check your connection and try again." } };
    }
    if (result.ok) {
      toast.success(okMessage);
      start(() => router.refresh());
      return true;
    }
    setError(result.error.message);
    setFieldErrors(result.error.fieldErrors ?? {});
    toast.error(result.error.code === "FORBIDDEN" ? "You can view settings but not change them." : result.error.message);
    return false;
  }
  return { run, pending, error, fieldErrors, clearError: () => { setError(null); setFieldErrors({}); } };
}

export function Section({ title, description, children, actions, testId }: { title: string; description?: string; children: ReactNode; actions?: ReactNode; testId?: string }) {
  return (
    <section className="rounded-lg border bg-card" data-testid={testId}>
      <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {error ? <p role="alert" className="text-xs text-status-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function TextField({ label, value, onChange, error, hint, disabled, placeholder, testId, type = "text", inputMode }: {
  label: string; value: string; onChange: (v: string) => void; error?: string | null; hint?: string; disabled?: boolean; placeholder?: string; testId?: string; type?: string;
  inputMode?: "numeric" | "decimal" | "text";
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <Input id={id} type={type} inputMode={inputMode} value={value} disabled={disabled} placeholder={placeholder} aria-invalid={!!error} data-testid={testId} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function SelectField({ label, value, onChange, options, disabled, error, testId, hint }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean; error?: string | null; testId?: string; hint?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        data-testid={testId}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:h-8 md:text-sm"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

/** Accessible on/off switch (native checkbox with role="switch"). */
export function Switch({ checked, onChange, label, disabled, testId, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; testId?: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <label htmlFor={id} className="min-w-0 text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors outline-none focus-visible:ring-3 focus-visible:ring-accent-strong disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "border-accent-strong bg-accent" : "border-input bg-muted",
        )}
      >
        <span className="sr-only">{checked ? "On" : "Off"}</span>
        <span aria-hidden="true" className={cn("inline-block size-4 rounded-full bg-foreground transition-transform", checked ? "translate-x-6" : "translate-x-1")} />
      </button>
    </div>
  );
}

export function SaveBar({ onSave, dirty, pending, disabled, label = "Save changes", testId, error }: { onSave: () => void; dirty: boolean; pending: boolean; disabled?: boolean; label?: string; testId?: string; error?: string | null }) {
  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button onClick={onSave} disabled={!dirty || pending || disabled} data-testid={testId}>{pending ? "Saving..." : label}</Button>
      {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
      {!error && !dirty && <p className="text-xs text-muted-foreground">No unsaved changes.</p>}
    </div>
  );
}

export function ReadOnlyNote({ readOnly }: { readOnly: boolean }) {
  if (!readOnly) return null;
  return (
    <p data-testid="settings-readonly" className="mb-4 rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground">
      You are viewing settings. Only a System Admin can change them.
    </p>
  );
}

/**
 * Re-orderable list. Rows can be dragged by the grip (pointer) or moved with the Up / Down buttons (keyboard and touch).
 * `onChange` receives the new id order; the parent persists it.
 */
export function ReorderList<T extends { id: string }>({ items, onChange, render, disabled, label, testIdPrefix }: {
  items: T[]; onChange: (orderedIds: string[]) => void; render: (item: T) => ReactNode; disabled?: boolean; label: string; testIdPrefix: string;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const ids = items.map((i) => i.id);
  return (
    <ol aria-label={label} className="divide-y rounded-lg border">
      {items.map((item, index) => (
        <li
          key={item.id}
          data-testid={`${testIdPrefix}-row`}
          draggable={!disabled}
          onDragStart={() => setDragFrom(index)}
          onDragOver={(e) => { if (dragFrom !== null) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); if (dragFrom !== null && dragFrom !== index) onChange(moveToIndex(ids, dragFrom, index)); setDragFrom(null); }}
          onDragEnd={() => setDragFrom(null)}
          className={cn("flex items-center gap-2 px-2 py-1.5", dragFrom === index && "bg-accent-subtle")}
        >
          <GripVertical aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground", disabled ? "opacity-30" : "cursor-grab")} />
          <span className="tabular w-6 shrink-0 text-xs text-muted-foreground">{index + 1}</span>
          <div className="min-w-0 flex-1">{render(item)}</div>
          {!disabled && (
            <div className="flex shrink-0">
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${index + 1} up`} disabled={index === 0} data-testid={`${testIdPrefix}-up`} onClick={() => onChange(moveItem(ids, item.id, -1))}><ArrowUp /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${index + 1} down`} disabled={index === items.length - 1} data-testid={`${testIdPrefix}-down`} onClick={() => onChange(moveItem(ids, item.id, 1))}><ArrowDown /></Button>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export const fieldError = (errors: Record<string, string[]>, name: string): string | null => errors[name]?.[0] ?? null;
