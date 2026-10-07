"use client";

import { useMemo } from "react";
import { FileWarning, IndianRupee, Landmark, Receipt } from "lucide-react";
import { KpiTile } from "@/components/shared/kpi-tile";
import { formatINR, moneyToNumber, sumMoney } from "@/lib/money";
import { taxOf, useInvoiceRows } from "./helpers";

/** Finance strip: Invoice Outstanding and GST items pending, with the overdue part of each. */
export function FinanceStrip({ onNavigate }: { onNavigate: (tab: "receivables" | "gst") => void }) {
  const rows = useInvoiceRows();
  const s = useMemo(() => {
    const open = rows.filter((r) => moneyToNumber(r.outstanding) > 0);
    const overdue = open.filter((r) => r.daysOverdue > 0);
    const pending = rows.filter((r) => r.invoice.gstFilingStatus === "PENDING");
    const pendingOverdue = pending.filter((r) => r.filingDaysOverdue > 0);
    return {
      outstanding: sumMoney(open.map((r) => r.outstanding)),
      openCount: open.length,
      overdue: sumMoney(overdue.map((r) => r.outstanding)),
      overdueCount: overdue.length,
      pending: pending.length,
      pendingOverdue: pendingOverdue.length,
      pendingTax: sumMoney(pending.map((r) => taxOf(r.invoice))),
      pendingTaxOverdue: sumMoney(pendingOverdue.map((r) => taxOf(r.invoice))),
    };
  }, [rows]);

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <button type="button" className="text-left" onClick={() => onNavigate("receivables")}>
        <KpiTile label="Invoice Outstanding" value={formatINR(s.outstanding, { compact: true })} hint={`${s.openCount} open invoices`} icon={IndianRupee} />
      </button>
      <button type="button" className="text-left" onClick={() => onNavigate("receivables")}>
        <KpiTile label="Overdue Receivables" value={formatINR(s.overdue, { compact: true })} hint={`${s.overdueCount} past due date`} icon={FileWarning} />
      </button>
      <button type="button" className="text-left" onClick={() => onNavigate("gst")}>
        <KpiTile label="GST Items Pending" value={String(s.pending)} hint={`${s.pendingOverdue} overdue`} icon={Receipt} />
      </button>
      <button type="button" className="text-left" onClick={() => onNavigate("gst")}>
        <KpiTile label="GST Pending Filing" value={formatINR(s.pendingTax, { compact: true })} hint={`${formatINR(s.pendingTaxOverdue, { compact: true })} overdue`} icon={Landmark} />
      </button>
    </div>
  );
}
