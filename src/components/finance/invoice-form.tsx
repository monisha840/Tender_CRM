"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { RecordForm, type FormField } from "@/components/data/record-form";
import type { ImportResult } from "@/components/data/import-export";
import { getToday } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { buildInvoice, defaultGstRegistrationId, gstinFitError, INVOICE_TYPES, resolveInvoiceRecord, suggestInvoiceNo, type InvoiceEntry } from "@/modules/finance/entry";
import { useDataStore } from "@/store/data-store";
import { useDb } from "@/store/hooks";
import type { Database } from "@/types";

const PROJECT_PREFIX = "project:";
const GSTIN_PREFIX = "gstin:";

/** Saves a built invoice, its deductions and its GST transaction row. */
function useSaveInvoice() {
  const upsert = useDataStore((s) => s.upsert);
  return (built: Extract<ReturnType<typeof buildInvoice>, { ok: true }>) => {
    upsert("invoices", built.invoice);
    built.deductions.forEach((d) => upsert("invoiceDeductions", d));
    upsert("gstTransactions", built.gstTransaction);
    built.retentionEntries.forEach((r) => upsert("retentionEntries", r));
    built.tdsTransactions.forEach((t) => upsert("gstTransactions", t));
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
      const { entry, error } = resolveInvoiceRecord(db, r, seen);
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
      // The GSTIN follows the project: only registrations that fit the project are offered, defaulting to its own.
      ...projects.map<FormField>((p) => {
        const fitting = regs.filter((g) => !gstinFitError(db, g, p));
        const preferred = defaultGstRegistrationId(db, p);
        return {
          name: `${GSTIN_PREFIX}${p.id}`,
          label: "Our GSTIN",
          type: "select",
          required: true,
          defaultValue: fitting.some((g) => g.id === preferred) ? preferred : (fitting[0]?.id ?? ""),
          when: (v) => v.organisationId === p.organisationId && v[`${PROJECT_PREFIX}${p.organisationId}`] === p.id,
          options: fitting.map((g) => ({ value: g.id, label: `${g.gstin} (${stateName(g.stateId)})` })),
          hint: "Taken from the project. Another state's GSTIN cannot be used for this project.",
        };
      }),
      {
        name: "invoiceNo",
        label: "Invoice no",
        placeholder: "Leave blank for the next number",
        hint: "Blank picks the next number in this GSTIN's series for the financial year (April to March). At most 16 characters.",
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
    const currentDb = useDataStore.getState().db;
    const projectId = v[`${PROJECT_PREFIX}${v.organisationId}`] ?? "";
    const gstRegistrationId = v[`${GSTIN_PREFIX}${projectId}`] ?? "";
    const entry: InvoiceEntry = {
      gstRegistrationId,
      organisationId: v.organisationId,
      projectId,
      invoiceNo: v.invoiceNo || suggestInvoiceNo(currentDb, gstRegistrationId, v.invoiceDate || today),
      invoiceDate: v.invoiceDate,
      invoiceType: v.invoiceType as InvoiceEntry["invoiceType"],
      periodFrom: v.periodFrom,
      periodTo: v.periodTo,
      taxableValue: v.taxableValue,
      gstPercent: v.gstPercent,
      deductions: v.deductions ?? "",
      deductionTypeId: v.deductionTypeId ?? "",
    };
    const built = buildInvoice(currentDb, entry);
    if (!built.ok) return built.error;
    save(built);
    toast.success(`Invoice ${built.invoice.invoiceNo} created`, { description: `Net receivable ${formatINR(built.invoice.netReceivable)}` });
  };

  return open ? (
    <RecordForm open={open} onOpenChange={onOpenChange} title="New invoice" description="Tax, totals and due dates are calculated for you." submitLabel="Create invoice" fields={fields} onSubmit={submit} />
  ) : null;
}
