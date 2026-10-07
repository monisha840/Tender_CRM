"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FormField {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime-local" | "select" | "textarea" | "tel" | "email";
  options?: FieldOption[];
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  hint?: string;
  /** Show only when this returns true for the current values. */
  when?: (values: Record<string, string>) => boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: FormField[];
  submitLabel?: string;
  /** Return an error message to keep the form open, or nothing to close it after saving. */
  onSubmit: (values: Record<string, string>) => string | void;
}

const controlClass =
  "min-h-11 w-full rounded-lg border bg-surface px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9 md:text-sm";

/** Slide-in form used by every "Add …" button: single column, 44px targets, inline validation, sticky save bar. */
export function RecordForm({ open, onOpenChange, title, description, fields, submitLabel = "Save", onSubmit }: Props) {
  const initial = () =>
    Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === "select" && f.required ? (f.options?.[0]?.value ?? "") : "")]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = fields.filter((f) => !f.when || f.when(values));
  const missing = visible.filter((f) => f.required && !values[f.name]?.trim());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (missing.length) return;
    const msg = onSubmit(Object.fromEntries(visible.map((f) => [f.name, values[f.name]?.trim() ?? ""])));
    if (msg) setError(msg);
    else {
      setValues(initial());
      setTouched(false);
      setError(null);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {visible.map((f) => {
              const id = `rf-${f.name}`;
              const invalid = touched && f.required && !values[f.name]?.trim();
              const common = {
                id,
                name: f.name,
                value: values[f.name] ?? "",
                "aria-invalid": invalid || undefined,
                "aria-describedby": invalid ? `${id}-err` : undefined,
                onChange: (e: { target: { value: string } }) => {
                  setError(null);
                  setValues((v) => ({ ...v, [f.name]: e.target.value }));
                },
              };
              return (
                <div key={f.name} className="space-y-1.5">
                  <label htmlFor={id} className="text-sm font-medium">
                    {f.label}
                    {f.required && <span className="text-status-danger"> *</span>}
                  </label>
                  {f.type === "select" ? (
                    <select {...common} className={controlClass}>
                      {!f.required && <option value="">—</option>}
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea {...common} rows={3} placeholder={f.placeholder} className={`${controlClass} py-2`} />
                  ) : (
                    <Input
                      {...common}
                      type={f.type ?? "text"}
                      inputMode={f.type === "number" ? "decimal" : undefined}
                      step={f.type === "number" ? "any" : undefined}
                      placeholder={f.placeholder}
                    />
                  )}
                  {f.hint && !invalid && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                  {invalid && (
                    <p id={`${id}-err`} className="text-xs text-status-danger">
                      {f.label} is required.
                    </p>
                  )}
                </div>
              );
            })}
            {error && (
              <p role="alert" className="rounded-md bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
                {error}
              </p>
            )}
          </div>
          <SheetFooter className="border-t bg-surface sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
