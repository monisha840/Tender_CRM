"use client";

import { useMemo, type ReactNode } from "react";
import { daysBetween, getToday } from "@/lib/dates";
import { addMoney } from "@/lib/money";
import { listInvoices, type InvoiceRow } from "@/lib/data/accounts";
import { useAsOfDb } from "@/components/layout/use-as-of-db";
import { useRegionFilter } from "@/store/hooks";
import type { Invoice, Money } from "@/types";
import { cn } from "@/lib/utils";

export const taxOf = (i: Pick<Invoice, "cgst" | "sgst" | "igst">): Money => addMoney(addMoney(i.cgst, i.sgst), i.igst);

/** Invoice rows for the current region filter. */
export function useInvoiceRows(): InvoiceRow[] {
  const db = useAsOfDb();
  const { region } = useRegionFilter();
  return useMemo(() => listInvoices(db, { region }), [db, region]);
}

/** Filing state shown as a badge: Filed, Pending, or Overdue (pending past its due date). */
export const filingKey = (r: InvoiceRow): "FILED" | "PENDING" | "OVERDUE" =>
  r.invoice.gstFilingStatus === "FILED" ? "FILED" : r.filingDaysOverdue > 0 ? "OVERDUE" : "PENDING";

/** Danger = payment or GST filing overdue; warning = payment due within 3 days or filing due within 7 days. */
export function invoiceTone(r: InvoiceRow): "danger" | "warning" | undefined {
  const today = getToday();
  const owes = Number(r.outstanding) > 0;
  const filing = r.invoice.gstFilingStatus === "PENDING";
  if (r.daysOverdue > 0 || (filing && r.filingDaysOverdue > 0)) return "danger";
  const payIn = daysBetween(today, r.invoice.dueDate);
  const fileIn = daysBetween(today, r.invoice.gstFilingDueDate);
  if ((owes && payIn >= 0 && payIn <= 3) || (filing && fileIn >= 0 && fileIn <= 7)) return "warning";
  return undefined;
}

const selectClass =
  "h-11 md:h-8 rounded-lg border border-input bg-surface px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Native select: best touch behaviour on phones, themed like Input. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn(selectClass, "min-w-0 max-w-full")}>
      <option value="ALL">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Two-line cell: main value with muted lines beneath. */
export function Stack({ main, sub }: { main: ReactNode; sub?: ReactNode[] }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate">{main}</span>
      {sub?.map((s, i) => (
        <span key={i} className="block truncate text-xs font-normal text-muted-foreground">
          {s}
        </span>
      ))}
    </span>
  );
}
