"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Banknote } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, getToday, istToUtc } from "@/lib/dates";
import { listInvoices } from "@/lib/data/accounts";
import { addMoney, cmpMoney, formatINR, isPositive, subMoney, toPaise, fromPaise } from "@/lib/money";
import { useDb, useRegionFilter } from "@/store/hooks";
import { useDataStore } from "@/store/data-store";
import { byId } from "@/lib/data/shared";
import type { Money } from "@/types";
import { filingKey, taxOf } from "./helpers";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-surface p-4" aria-label={title}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({ label, children, numeric, strong }: { label: string; children: ReactNode; numeric?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:block">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 break-words ${numeric ? "tabular text-right sm:text-left" : ""} ${strong ? "font-semibold" : ""}`}>{children}</dd>
    </div>
  );
}

export function InvoiceDetail({ id }: { id: string }) {
  const db = useDb();
  const { region } = useRegionFilter();
  const upsert = useDataStore((s) => s.upsert);
  const [recording, setRecording] = useState(false);
  const [amountInput, setAmountInput] = useState("");

  const row = useMemo(() => listInvoices(db, { region: "ALL" }).find((r) => r.invoice.id === id), [db, id]);

  if (!row) {
    return (
      <>
        <BackLink />
        <div className="rounded-lg border bg-surface">
          <EmptyState message="This invoice could not be found." action={{ label: "Back to invoices", href: "/finance" }} />
        </div>
      </>
    );
  }

  const { invoice: i } = row;
  const reg = byId(db.gstRegistrations, i.gstRegistrationId);
  const state = byId(db.states, reg?.stateId);
  const org = byId(db.organisations, i.organisationId);
  const regionLabel = byId(db.regions, i.regionId)?.name ?? "—";
  const deductions = db.invoiceDeductions
    .filter((d) => d.invoiceId === i.id)
    .map((d) => ({ id: d.id, name: byId(db.deductionTypes, d.deductionTypeId)?.name ?? "Deduction", amount: d.amount }));
  const payments = db.payments.filter((p) => p.invoiceId === i.id).sort((a, b) => b.paidOn.localeCompare(a.paidOn));
  const hasOutstanding = isPositive(row.outstanding);
  const outOfScope = region !== "ALL" && region !== i.regionId;

  const startRecording = () => {
    setAmountInput(String(Number(row.outstanding)));
    setRecording(true);
  };

  const confirm = () => {
    const raw = amountInput.replace(/,/g, "").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || !isPositive(raw)) return toast.error("Enter a valid amount.");
    const amount: Money = fromPaise(toPaise(raw));
    if (cmpMoney(amount, row.outstanding) > 0) return toast.error(`Amount exceeds outstanding ${formatINR(row.outstanding)}.`);
    const received = addMoney(i.receivedAmount, amount);
    const now = istToUtc(getToday(), "10:30");
    upsert("invoices", {
      ...i,
      receivedAmount: received,
      paymentStatus: cmpMoney(received, i.netReceivable) >= 0 ? "PAID" : "PARTLY_PAID",
      updatedAt: now,
    });
    upsert("payments", {
      id: `pay-${i.id}-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      direction: "IN",
      purpose: "INVOICE_RECEIPT",
      amount,
      paidOn: getToday(),
      mode: "BANK_TRANSFER",
      regionId: i.regionId,
      projectId: i.projectId,
      gstRegistrationId: i.gstRegistrationId,
      organisationId: i.organisationId,
      invoiceId: i.id,
      remarks: "Recorded from invoice screen",
    });
    setRecording(false);
    toast.success(`Recorded ${formatINR(amount)} against ${i.invoiceNo}.`);
  };

  const filing = filingKey(row);
  return (
    <>
      <BackLink />
      <PageHeader
        title={`Invoice ${i.invoiceNo}`}
        status={<StatusBadge status={row.daysOverdue > 0 ? "OVERDUE" : i.paymentStatus} />}
        description={`${row.organisationName} · ${row.projectName} · ${formatDate(i.invoiceDate)}`}
        primaryAction={hasOutstanding && !recording ? { label: "Record payment", icon: Banknote, onClick: startRecording } : undefined}
      />
      {outOfScope && <p className="mb-4 text-xs text-muted-foreground">This invoice is outside the region currently selected in the header.</p>}

      {recording && (
        <div className="mb-4 rounded-lg border border-accent-strong bg-accent-subtle p-4" role="group" aria-label="Record payment">
          <p className="text-sm font-medium">Record a payment received</p>
          <p className="text-xs text-muted-foreground">Outstanding {formatINR(row.outstanding)}. Enter the amount received today; part payments are fine.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="pay-amount">Amount received in rupees</label>
            <Input id="pay-amount" inputMode="decimal" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} className="sm:max-w-48" />
            <div className="flex gap-2">
              <Button className="flex-1 sm:flex-none" onClick={confirm}>Confirm</Button>
              <Button className="flex-1 sm:flex-none" variant="outline" onClick={() => setRecording(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Invoice">
          <Field label="Invoice number">{i.invoiceNo}</Field>
          <Field label="Invoice date">{formatDate(i.invoiceDate)}</Field>
          <Field label="Type">{i.invoiceType === "MONTHLY" ? "Monthly (service contract)" : i.invoiceType === "MILESTONE" ? "Milestone" : "Final"}</Field>
          <Field label="Billing period">{formatDate(i.periodFrom)} to {formatDate(i.periodTo)}</Field>
          <Field label="Project">{row.projectName}</Field>
          <Field label="Region">{regionLabel}</Field>
        </Section>

        <Section title="Parties and GSTIN">
          <Field label="Our GSTIN">{reg?.gstin ?? "—"}{state ? ` (${state.name})` : ""}</Field>
          <Field label="Billed by">{reg?.legalName ?? "—"}</Field>
          <Field label="Customer">{org?.name ?? row.organisationName}</Field>
          <Field label="Customer GSTIN">{i.customerGstin}</Field>
        </Section>

        <Section title="Amounts">
          <Field label="Taxable value" numeric>{formatINR(i.taxableValue)}</Field>
          <Field label="CGST" numeric>{formatINR(i.cgst)}</Field>
          <Field label="SGST" numeric>{formatINR(i.sgst)}</Field>
          <Field label="IGST" numeric>{formatINR(i.igst)}</Field>
          <Field label="Total GST" numeric>{formatINR(taxOf(i))}</Field>
          <Field label="Invoice total" numeric strong>{formatINR(i.total)}</Field>
          <Field label="Deductions by customer" numeric>{formatINR(i.totalDeductions)}</Field>
          <Field label="Net receivable" numeric strong>{formatINR(i.netReceivable)}</Field>
          {deductions.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="mb-1 text-xs text-muted-foreground">Deduction breakdown</dt>
              <dd>
                <ul className="divide-y rounded-md border text-sm">
                  {deductions.map((d) => (
                    <li key={d.id} className="flex justify-between gap-3 px-3 py-1.5">
                      <span>{d.name}</span>
                      <span className="tabular">{formatINR(d.amount)}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </Section>

        <div className="space-y-4">
          <Section title="Payment">
            <Field label="Payment status"><StatusBadge status={i.paymentStatus} /></Field>
            <Field label="Payment due date">
              {formatDate(i.dueDate)}
              {row.daysOverdue > 0 && <span className="text-status-danger"> · {row.daysOverdue} days overdue</span>}
            </Field>
            <Field label="Received" numeric>{formatINR(i.receivedAmount)}</Field>
            <Field label="Outstanding" numeric strong>{formatINR(subMoney(i.netReceivable, i.receivedAmount))}</Field>
            {payments.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="mb-1 text-xs text-muted-foreground">Receipts</dt>
                <dd>
                  <ul className="divide-y rounded-md border text-sm">
                    {payments.map((p) => (
                      <li key={p.id} className="flex justify-between gap-3 px-3 py-1.5">
                        <span>{formatDate(p.paidOn)}{p.utr ? ` · ${p.utr}` : ""}</span>
                        <span className="tabular">{formatINR(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </Section>

          <Section title="GST filing">
            <Field label="Filing status"><StatusBadge status={filing} /></Field>
            <Field label="Filing due date">
              {formatDate(i.gstFilingDueDate)}
              {row.filingDaysOverdue > 0 && <span className="text-status-danger"> · {row.filingDaysOverdue} days overdue</span>}
            </Field>
            <Field label="Filing reference no.">{i.filingReference ?? "Not filed yet"}</Field>
          </Section>
        </div>
      </div>
    </>
  );
}

function BackLink() {
  return (
    <Link href="/finance" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-accent-strong hover:underline md:min-h-8">
      <ArrowLeft className="size-4" aria-hidden="true" /> GST & Finance
    </Link>
  );
}
