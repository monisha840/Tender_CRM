"use client";

import { useMemo, useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { ImportExport } from "@/components/data/import-export";
import { DeadlineBadge, StatusBadge } from "@/components/shared/status-badge";
import { daysBetween, formatDate, formatMonth, getToday } from "@/lib/dates";
import { formatINR, moneyToNumber, sumMoney } from "@/lib/money";
import { useDb } from "@/store/hooks";
import { FilterSelect, Stack, taxOf, useInvoiceRows } from "./helpers";

interface MonthRow {
  key: string;
  month: string;
  count: number;
  filedCount: number;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  tax: string;
  status: "FILED" | "PENDING" | "OVERDUE";
  refs: string[];
  dueDate: string;
}

/** GST position per GSTIN and invoice month: tax totals, filing status and reference numbers. */
export function GstSummary() {
  const db = useDb();
  const invoices = useInvoiceRows();
  const [gstin, setGstin] = useState("ALL");

  const groups = useMemo(
    () =>
      db.gstRegistrations
        .filter((g) => gstin === "ALL" || g.id === gstin)
        .map((reg) => {
          const mine = invoices.filter((r) => r.invoice.gstRegistrationId === reg.id);
          const months = [...new Set(mine.map((r) => r.invoice.invoiceDate.slice(0, 7)))].sort().reverse();
          const rows = months.map((month): MonthRow => {
            const inMonth = mine.filter((r) => r.invoice.invoiceDate.startsWith(month));
            const pending = inMonth.filter((r) => r.invoice.gstFilingStatus === "PENDING");
            const sum = (pick: "taxableValue" | "cgst" | "sgst" | "igst") => sumMoney(inMonth.map((r) => r.invoice[pick]));
            return {
              key: `${reg.id}-${month}`,
              month,
              count: inMonth.length,
              filedCount: inMonth.length - pending.length,
              taxable: sum("taxableValue"),
              cgst: sum("cgst"),
              sgst: sum("sgst"),
              igst: sum("igst"),
              tax: sumMoney(inMonth.map((r) => taxOf(r.invoice))),
              status: pending.length === 0 ? "FILED" : pending.some((r) => r.filingDaysOverdue > 0) ? "OVERDUE" : "PENDING",
              refs: [...new Set(inMonth.map((r) => r.invoice.filingReference).filter((x): x is string => !!x))],
              dueDate: inMonth.map((r) => r.invoice.gstFilingDueDate).sort()[0],
            };
          });
          return { reg, rows, pendingTax: sumMoney(mine.filter((r) => r.invoice.gstFilingStatus === "PENDING").map((r) => taxOf(r.invoice))) };
        })
        .filter((g) => g.rows.length > 0),
    [db.gstRegistrations, invoices, gstin],
  );

  const amt = (m: string) => (moneyToNumber(m) === 0 ? "—" : formatINR(m));
  const columns: DataTableColumn<MonthRow>[] = [
    { key: "month", header: "Month", mobile: "title", cell: (r) => <Stack main={formatMonth(r.month)} sub={[`${r.count} invoice${r.count === 1 ? "" : "s"}`]} /> },
    { key: "taxable", header: "Taxable", numeric: true, cell: (r) => formatINR(r.taxable) },
    { key: "cgst", header: "CGST", numeric: true, cell: (r) => amt(r.cgst) },
    { key: "sgst", header: "SGST", numeric: true, cell: (r) => amt(r.sgst) },
    { key: "igst", header: "IGST", numeric: true, cell: (r) => amt(r.igst) },
    { key: "tax", header: "Total tax", numeric: true, cell: (r) => <span className="font-medium">{formatINR(r.tax)}</span> },
    {
      key: "status",
      header: "Filing status",
      mobile: "badge",
      cell: (r) => <Stack main={<StatusBadge status={r.status} />} sub={[`${r.filedCount} of ${r.count} filed`, ...(r.status === "FILED" ? [] : [`Due ${formatDate(r.dueDate)}`, <DeadlineBadge key="d" value={r.dueDate} />])]} />,
    },
    {
      key: "refs",
      header: "Reference no.",
      cell: (r) => (r.refs.length ? <Stack main={r.refs[0]} sub={r.refs.length > 1 ? [`+${r.refs.length - 1} more`] : undefined} /> : <span className="text-muted-foreground">Not filed</span>),
    },
  ];

  const exportRows = groups.flatMap(({ reg, rows }) =>
    rows.map((r) => [reg.gstin, r.month, r.count, r.filedCount, r.taxable, r.cgst, r.sgst, r.igst, r.tax, r.status, r.dueDate, r.refs.join("; ")]),
  );
  return (
    <div className="space-y-6">
      <ImportExport
        filename="gst-summary"
        headers={["GSTIN", "Month", "Invoices", "Filed", "Taxable", "CGST", "SGST", "IGST", "Total tax", "Filing status", "Filing due", "Reference"]}
        rows={exportRows}
      />
      <div className="flex">
        <FilterSelect
          label="GSTIN"
          allLabel="All GSTINs"
          value={gstin}
          onChange={setGstin}
          options={db.gstRegistrations.map((g) => ({ value: g.id, label: g.gstin }))}
        />
      </div>
      {groups.map(({ reg, rows, pendingTax }) => {
        const state = db.states.find((s) => s.id === reg.stateId)?.name;
        return (
          <section key={reg.id} aria-label={`GST summary ${reg.gstin}`}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div>
                <h3 className="text-sm font-semibold">{reg.gstin}</h3>
                <p className="text-xs text-muted-foreground">{state ?? "—"} · {reg.legalName}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Pending filing: <span className="tabular font-medium text-foreground">{formatINR(pendingTax)}</span>
              </p>
            </div>
            <DataTable caption={`GST by month for ${reg.gstin}`} columns={columns} rows={rows} getRowId={(r) => r.key} getRowTone={(r) => (r.status === "OVERDUE" ? "danger" : r.status === "PENDING" && daysBetween(getToday(), r.dueDate) <= 7 ? "warning" : undefined)} pageSize={12} emptyMessage="No invoices for this GSTIN." />
          </section>
        );
      })}
      {groups.length === 0 && <p className="text-sm text-muted-foreground">No invoices for this selection.</p>}
    </div>
  );
}

