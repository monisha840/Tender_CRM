"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Underlined tab bar that scrolls sideways on a phone instead of wrapping. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div role="tablist" className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          type="button"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "-mb-px min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === t.key ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Progress bar: yellow fill with a thin strong outline (yellow alone is low-contrast on white). */
export function ProgressBar({ value, marker, className }: { value: number; marker?: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="relative h-2 min-w-16 flex-1 rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(v)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full border border-accent-strong bg-accent" style={{ width: `${v}%` }} />
        {marker !== undefined && <span className="absolute top-[-2px] h-3 w-0.5 bg-foreground/60" style={{ left: `${Math.min(100, marker)}%` }} title="Planned" />}
      </div>
      <span className="tabular w-10 text-right text-xs text-muted-foreground">{Math.round(v)}%</span>
    </div>
  );
}

/** Label/value grid for record details. Collapses to one column on a phone. */
export function FieldGrid({ fields, className }: { fields: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {fields.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{f.label}</dt>
          <dd className="mt-0.5 text-sm break-words">{f.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Pill filter buttons (status / health filters on lists). */
export function FilterPills<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "min-h-9 rounded-md border px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.key ? "border-accent-strong bg-accent text-accent-foreground" : "bg-surface text-muted-foreground hover:bg-accent-subtle",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const textareaClass =
  "w-full rounded-lg border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

/** Hydration guard: seed is rebuilt client-side, so render skeleton until persisted edits are loaded. */
export function Loading() {
  return <div className="h-40 animate-pulse rounded-lg bg-muted" aria-busy="true" aria-label="Loading" />;
}
