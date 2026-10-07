"use client";

import { useMemo, useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMonth } from "@/lib/dates";
import type { InvoiceRow } from "@/lib/data/accounts";
import { formatINR, moneyToNumber } from "@/lib/money";
import { useDb } from "@/store/hooks";
import { FilterSelect, filingKey, Stack, useInvoiceRows } from "./helpers";

const amount = (m: string) => (moneyToNumber(m) === 0 ? "—" : formatINR(m));

export function InvoiceList() {
  const db = useDb();
  const all = useInvoiceRows();
  const [gstin, setGstin] = useState("ALL");
  const [customer, setCustomer] = useState("ALL");
  const [payment, setPayment] = useState("ALL");
  const [filing, setFiling] = useState("ALL");
  const [month, setMonth] = useState("ALL");

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
          sub={[`Due ${formatDate(r.invoice.dueDate)}`, ...(r.daysOverdue > 0 ? [`${r.daysOverdue} days overdue`] : [])]}
        />
      ),
    },
    {
      key: "filing",
      header: "GST filing",
      cell: (r) => (
        <Stack
          main={<StatusBadge status={filingKey(r)} />}
          sub={[`Ref ${r.invoice.filingReference ?? "—"}`, `Due ${formatDate(r.invoice.gstFilingDueDate)}`]}
        />
      ),
    },
  ];

  return (
    <DataTable
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
  );
}
