"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { RecordForm, type FormField } from "@/components/data/record-form";
import type { ImportResult } from "@/components/data/import-export";
import { getToday } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { buildInvoice, INVOICE_TYPES, resolveInvoiceRecord, suggestInvoiceNo, type InvoiceEntry } from "@/modules/finance/entry";
import { useDataStore } from "@/store/data-store";
import { useDb } from "@/store/hooks";
import type { Database } from "@/types";

const PROJECT_PREFIX = "project:";

/** Saves a built invoice, its deductions and its GST transaction row. */
function useSaveInvoice() {
  const upsert = useDataStore((s) => s.upsert);
  return (built: Extract<ReturnType<typeof buildInvoice>, { ok: true }>) => {
    upsert("invoices", built.invoice);
    built.deductions.forEach((d) => upsert("invoiceDeductions", d));
    upsert("gstTransactions", built.gstTransaction);
  };
}

/** Invoice rows from a CSV file; duplicates within the file are caught too. */
export function useInvoiceImport() {
  const save = useSaveInvoice();
  return (records: Record<string, string>[]): ImportResult => {
    const db: Database = useDataStore.getState().db;
    const errors: string[] = [];
    const seen: string[] = [];
    let imported = 0;
    records.forEach((r, i) => {
      const row = `Row ${i + 2}`;
      const { entry, error } = resolveInvoiceRecord(db, r);
      if (!entry) return void errors.push(`${row}: ${error}`);
      const built = buildInvoice(db, entry, seen);
      if (!built.ok) return void errors.push(`${row}: ${built.error}`);
      seen.push(`${entry.gstRegistrationId}|${built.invoice.invoiceNo.toLowerCase()}`);
      save(built);
      imported++;
    });
    return { imported, errors };
  };
}

/** "New invoice" form: tax split, totals, due dates and statuses are computed, not typed. */
export function InvoiceFormSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDb();
  const save = useSaveInvoice();
  const today = getToday();

  const fields = useMemo<FormField[]>(() => {
    const regs = db.gstRegistrations.filter((g) => g.isActive);
    const stateName = (id: string) => db.states.find((s) => s.id === id)?.name ?? "";
    const projects = db.projects.filter((p) => !p.deletedAt);
    const orgs = db.organisations.filter((o) => projects.some((p) => p.organisationId === o.id)).sort((a, b) => a.name.localeCompare(b.name));
    const regionName = (id: string) => db.regions.find((r) => r.id === id)?.name ?? "";
    const dedTypes = db.deductionTypes.filter((d) => d.appliesTo !== "SUB_BILL");
    return [
      { name: "gstRegistrationId", label: "Our GSTIN", type: "select", required: true, options: regs.map((g) => ({ value: g.id, label: `${g.gstin} (${stateName(g.stateId)})` })) },
      { name: "organisationId", label: "Customer", type: "select", required: true, options: orgs.map((o) => ({ value: o.id, label: o.name })) },
      ...orgs.map<FormField>((o) => ({
        name: `${PROJECT_PREFIX}${o.id}`,
        label: "Project",
        type: "select",
        required: true,
        when: (v) => v.organisationId === o.id,
        options: projects.filter((p) => p.organisationId === o.id).map((p) => ({ value: p.id, label: `${p.name} (${regionName(p.regionId)})` })),
        hint: "Due date is the invoice date plus the project's payment terms.",
      })),
      {
        name: "invoiceNo",
        label: "Invoice no",
        required: true,
        defaultValue: regs[0] ? suggestInvoiceNo(db, regs[0].id, today) : "",
        hint: "Suggested from the latest number for the first GSTIN. Change it if you pick another GSTIN.",
      },
      { name: "invoiceDate", label: "Invoice date", type: "date", required: true, defaultValue: today },
      { name: "invoiceType", label: "Type", type: "select", required: true, options: INVOICE_TYPES.map((t) => ({ value: t, label: t[0] + t.slice(1).toLowerCase() })) },
      { name: "periodFrom", label: "Period from", type: "date", required: true },
      { name: "periodTo", label: "Period to", type: "date", required: true },
      { name: "taxableValue", label: "Taxable value (₹)", type: "number", required: true, placeholder: "e.g. 2500000" },
      { name: "gstPercent", label: "GST %", type: "number", required: true, defaultValue: "18", hint: "Same state as your GSTIN splits into CGST + SGST; otherwise IGST." },
      { name: "deductions", label: "Deductions (₹)", type: "number", placeholder: "TDS, retention etc.; 0 if none" },
      { name: "deductionTypeId", label: "Deduction type", type: "select", options: dedTypes.map((d) => ({ value: d.id, label: d.name })), defaultValue: "ded_tds_it" },
    ];
  }, [db, today]);

  const submit = (v: Record<string, string>): string | void => {
    const entry: InvoiceEntry = {
      gstRegistrationId: v.gstRegistrationId,
      organisationId: v.organisationId,
      projectId: v[`${PROJECT_PREFIX}${v.organisationId}`] ?? "",
      invoiceNo: v.invoiceNo,
      invoiceDate: v.invoiceDate,
      invoiceType: v.invoiceType as InvoiceEntry["invoiceType"],
      periodFrom: v.periodFrom,
      periodTo: v.periodTo,
      taxableValue: v.taxableValue,
      gstPercent: v.gstPercent,
      deductions: v.deductions ?? "",
      deductionTypeId: v.deductionTypeId ?? "",
    };
    const built = buildInvoice(useDataStore.getState().db, entry);
    if (!built.ok) return built.error;
    save(built);
    toast.success(`Invoice ${built.invoice.invoiceNo} created`, { description: `Net receivable ${formatINR(built.invoice.netReceivable)}` });
  };

  return open ? (
    <RecordForm open={open} onOpenChange={onOpenChange} title="New invoice" description="Tax, totals and due dates are calculated for you." submitLabel="Create invoice" fields={fields} onSubmit={submit} />
  ) : null;
}
