import type { Metadata } from "next";
import { Suspense } from "react";
import { BillReadinessOverview } from "@/components/bill-readiness/overview";
import { EmptyState } from "@/components/shared/empty-state";
import { moduleAccess } from "@/modules/documents/access";
import { currentMonth, loadOverview } from "@/modules/bill-readiness/queries";
import { isPeriodMonth } from "@/modules/bill-readiness/readiness";

export const metadata: Metadata = { title: "Bill readiness" };

async function Overview({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const access = await moduleAccess("bill_readiness");
  if (!access.canView) {
    return (
      <div className="rounded-lg border bg-surface">
        <EmptyState message="Your role cannot view bill readiness." action={{ label: "Back to dashboard", href: "/dashboard" }} />
      </div>
    );
  }
  const { month: m } = await searchParams;
  const month = m && isPeriodMonth(m) ? m : currentMonth();
  const rows = await loadOverview(month);
  return <BillReadinessOverview rows={rows} month={month} canUpdate={access.canUpdate} />;
}

export default function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  return (
    <Suspense fallback={null}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}
