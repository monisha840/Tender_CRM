"use client";

import { useMemo } from "react";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { ImportExport } from "@/components/data/import-export";
import { DeadlineBadge, StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMonth } from "@/lib/dates";
import type { InvoiceRow } from "@/lib/data/accounts";
import { formatINR, moneyToNumber } from "@/lib/money";
import { useUrlState } from "@/lib/use-url-param";
import { useAsOfDb } from "@/components/layout/use-as-of-db";
import { INVOICE_HEADERS } from "@/modules/finance/entry";
import { useInvoiceImport } from "./invoice-form";
import { FilterSelect, filingKey, invoiceTone, Stack, taxOf, useInvoiceRows } from "./helpers";

const amount = (m: string) => (moneyToNumber(m) === 0 ? "—" : formatINR(m));

export function InvoiceList() {
  const db = useAsOfDb();
  const importInvoices = useInvoiceImport();
  const all = useInvoiceRows();
  // Filters are kept in the URL (also read by links from the dashboard, e.g. ?customer=<organisation id>).
  const [gstin, setGstin] = useUrlState("gstin", "ALL");
  const [customer, setCustomer] = useUrlState("customer", "ALL");
  const [payment, setPayment] = useUrlState("payment", "ALL");
  const [filing, setFiling] = useUrlState("filing", "ALL");
  const [month, setMonth] = useUrlState("month", "ALL");

  const gstinOf = useMemo(() => new Map(db.gstRegistrations.map((g) => [g.id, g.gstin])), [db.gstRegistrations]);
  const months = useMemo(() => [...new Set(all.map((r) => r.invoice.invoiceDate.slice(0, 7)))].sort().reverse(), [all]);
  const customers = useMemo(
    () => [...new Map(all.map((r) => [r.invoice.organisationId, r.organisationName])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [all],
  );

  const rows = useMemo(
    () =>
      all.filter(
        (r) =>
          (gstin === "ALL" || r.invoice.gstRegistrationId === gstin) &&
          (customer === "ALL" || r.invoice.organisationId === customer) &&
          (payment === "ALL" || r.invoice.paymentStatus === payment) &&
          (filing === "ALL" || filingKey(r) === filing) &&
          (month === "ALL" || r.invoice.invoiceDate.startsWith(month)),
      ),
    [all, gstin, customer, payment, filing, month],
  );
  const dirty = [gstin, customer, payment, filing, month].some((v) => v !== "ALL");
  const reset = () => {
    setGstin("ALL");
    setCustomer("ALL");
    setPayment("ALL");
    setFiling("ALL");
    setMonth("ALL");
  };

  const columns: DataTableColumn<InvoiceRow>[] = [
    {
      key: "invoice",
      header: "Invoice",
      mobile: "title",
      sortValue: (r) => r.invoice.invoiceDate,
      cell: (r) => <Stack main={r.invoice.invoiceNo} sub={[formatDate(r.invoice.invoiceDate)]} />,
    },
    {
      key: "customer",
      header: "Customer",
      sortValue: (r) => r.organisationName,
      cell: (r) => <Stack main={r.organisationName} sub={[r.invoice.customerGstin]} />,
    },
    {
      key: "gstin",
      header: "Our GSTIN",
      cell: (r) => <span className="text-xs">{gstinOf.get(r.invoice.gstRegistrationId) ?? "—"}</span>,
    },
    { key: "taxable", header: "Taxable", numeric: true, sortValue: (r) => moneyToNumber(r.invoice.taxableValue), cell: (r) => formatINR(r.invoice.taxableValue) },
    { key: "cgst", header: "CGST", numeric: true, cell: (r) => amount(r.invoice.cgst) },
    { key: "sgst", header: "SGST", numeric: true, cell: (r) => amount(r.invoice.sgst) },
    { key: "igst", header: "IGST", numeric: true, cell: (r) => amount(r.invoice.igst) },
    { key: "total", header: "Total", numeric: true, sortValue: (r) => moneyToNumber(r.invoice.total), cell: (r) => <span className="font-medium">{formatINR(r.invoice.total)}</span> },
    {
      key: "payment",
      header: "Payment",
      mobile: "badge",
      cell: (r) => (
        <Stack
          main={<StatusBadge status={r.invoice.paymentStatus} />}
          sub={[`Due ${formatDate(r.invoice.dueDate)}`, ...(Number(r.outstanding) > 0 ? [<DeadlineBadge key="d" value={r.invoice.dueDate} />] : [])]}
        />
      ),
    },
    {
      key: "filing",
      header: "GST filing",
      cell: (r) => (
        <Stack
          main={<StatusBadge status={filingKey(r)} />}
          sub={[`Ref ${r.invoice.filingReference ?? "—"}`, `Due ${formatDate(r.invoice.gstFilingDueDate)}`, ...(r.invoice.gstFilingStatus === "PENDING" ? [<DeadlineBadge key="f" value={r.invoice.gstFilingDueDate} />] : [])]}
        />
      ),
    },
  ];

  const exportRows = rows.map((r) => [
    r.invoice.invoiceNo, r.invoice.invoiceDate, gstinOf.get(r.invoice.gstRegistrationId) ?? "", r.organisationName, r.projectName, r.invoice.invoiceType,
    r.invoice.periodFrom, r.invoice.periodTo, r.invoice.taxableValue, moneyToNumber(r.invoice.taxableValue) ? Math.round((moneyToNumber(taxOf(r.invoice)) / moneyToNumber(r.invoice.taxableValue)) * 10000) / 100 : "", r.invoice.totalDeductions, "",
  ]);

  return (
    <>
    <ImportExport filename="invoices" headers={INVOICE_HEADERS} rows={exportRows} onImport={importInvoices} />
    <DataTable
      getRowTone={invoiceTone}
      caption="Invoices"
      columns={columns}
      rows={rows}
      getRowId={(r) => r.invoice.id}
      getRowHref={(r) => `/finance/invoices/${r.invoice.id}`}
      search={{ placeholder: "Search invoice, customer, project", getText: (r) => `${r.invoice.invoiceNo} ${r.organisationName} ${r.projectName} ${r.invoice.customerGstin}` }}
      emptyMessage="No invoices match these filters."
      pageSize={20}
      toolbar={
        <>
          <FilterSelect label="GSTIN" allLabel="All GSTINs" value={gstin} onChange={setGstin} options={db.gstRegistrations.map((g) => ({ value: g.id, label: g.gstin }))} />
          <FilterSelect label="Customer" allLabel="All customers" value={customer} onChange={setCustomer} options={customers.map(([v, l]) => ({ value: v, label: l }))} />
          <FilterSelect
            label="Payment status"
            allLabel="Any payment status"
            value={payment}
            onChange={setPayment}
            options={[
              { value: "UNPAID", label: "Unpaid" },
              { value: "PARTLY_PAID", label: "Partly paid" },
              { value: "PAID", label: "Paid" },
            ]}
          />
          <FilterSelect
            label="GST filing status"
            allLabel="Any filing status"
            value={filing}
            onChange={setFiling}
            options={[
              { value: "FILED", label: "Filed" },
              { value: "PENDING", label: "Pending" },
              { value: "OVERDUE", label: "Overdue" },
            ]}
          />
          <FilterSelect label="Month" allLabel="All months" value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: formatMonth(m) }))} />
          {dirty && (
            <Button variant="ghost" size="sm" onClick={reset}>
              Clear filters
            </Button>
          )}
        </>
      }
    />
    </>
  );
}
