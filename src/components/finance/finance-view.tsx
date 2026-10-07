"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
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
  const [tab, setTab] = useState<Tab>("invoices");
  const go = (t: Tab) => {
    setTab(t);
    document.getElementById("finance-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <>
      <PageHeader title="GST & Finance" description="Invoices, receivables and GST filing status across all GSTINs." />
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
