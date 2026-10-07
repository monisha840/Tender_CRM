"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { useUrlParam } from "@/lib/use-url-param";
import { PageHeader } from "@/components/layout/page-header";
import { daysBetween, getToday } from "@/lib/dates";
import { formatINR, sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { InvoiceFormSheet } from "./invoice-form";
import { useInvoiceRows } from "./helpers";
import { FinanceStrip } from "./finance-strip";
import { GstSummary } from "./gst-summary";
import { InvoiceList } from "./invoice-list";
import { Receivables } from "./receivables";
import { RevenueExpensesChart } from "./revenue-chart";
import { TrackingNote } from "./tracking-note";

const TABS = [
  { key: "invoices", label: "Invoices" },
  { key: "gst", label: "GST summary" },
  { key: "receivables", label: "Receivables" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function FinanceView() {
  const [picked, setTab] = useState<Tab | null>(null);
  const viewParam = useUrlParam("view");
  const fromUrl = TABS.find((t) => t.key === viewParam)?.key;
  const tab: Tab = picked ?? fromUrl ?? "invoices";
  const go = (t: Tab) => {
    setTab(t);
    document.getElementById("finance-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const [adding, setAdding] = useState(false);
  const rows = useInvoiceRows();
  const alerts = useMemo(() => {
    const today = getToday();
    const open = rows.filter((r) => Number(r.outstanding) > 0);
    const overdue = open.filter((r) => r.daysOverdue > 0);
    const dueSoon = open.filter((r) => r.daysOverdue === 0 && daysBetween(today, r.invoice.dueDate) <= 3);
    const filing = rows.filter((r) => r.invoice.gstFilingStatus === "PENDING" && daysBetween(today, r.invoice.gstFilingDueDate) <= 7);
    return { overdue, dueSoon, filing, overdueAmount: sumMoney(overdue.map((r) => r.outstanding)), filingOverdue: filing.filter((r) => r.filingDaysOverdue > 0).length };
  }, [rows]);
  const hasAlerts = alerts.overdue.length + alerts.dueSoon.length + alerts.filing.length > 0;
  return (
    <>
      <PageHeader
        title="GST & Finance"
        description="Invoices, receivables and GST filing status across all GSTINs."
        primaryAction={{ label: "New invoice", icon: Plus, onClick: () => setAdding(true) }}
      />
      <InvoiceFormSheet open={adding} onOpenChange={setAdding} />
      {hasAlerts && (
        <div role="alert" className="mb-4 flex flex-col gap-2 rounded-lg border border-status-danger/40 bg-status-danger/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-danger" aria-hidden="true" />
            <span>
              <span className="font-medium">Needs attention:</span>{" "}
              {[
                alerts.overdue.length > 0 && `${alerts.overdue.length} overdue invoice${alerts.overdue.length === 1 ? "" : "s"} (${formatINR(alerts.overdueAmount, { compact: "auto" })})`,
                alerts.dueSoon.length > 0 && `${alerts.dueSoon.length} due within 3 days`,
                alerts.filing.length > 0 && `${alerts.filing.length} GST filing${alerts.filing.length === 1 ? "" : "s"} due soon or overdue${alerts.filingOverdue ? ` (${alerts.filingOverdue} overdue)` : ""}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </p>
          <Link href="/finance?view=receivables" onClick={() => setTab("receivables")} className="inline-flex min-h-11 shrink-0 items-center font-medium text-accent-strong hover:underline sm:min-h-0">
            View receivables
          </Link>
        </div>
      )}
      <TrackingNote />
      <FinanceStrip onNavigate={go} />
      <RevenueExpensesChart />

      <div id="finance-tabs" role="tablist" aria-label="Finance views" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium transition-colors md:min-h-9",
              tab === t.key ? "border-accent-strong text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "invoices" && <InvoiceList />}
        {tab === "gst" && <GstSummary />}
        {tab === "receivables" && <Receivables />}
      </div>
    </>
  );
}
