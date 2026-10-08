import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyLockedView } from "@/components/money-locked/money-locked-view";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/server/permissions";
import { getMoneyLockedSummary, loadLedger } from "@/modules/money-locked/service";

export const metadata: Metadata = { title: "Money locked" };

async function Content() {
  const user = await requireUser();
  if (!(await can(user, "money_locked", "VIEW"))) {
    return (
      <>
        <PageHeader title="Money locked with clients" />
        <div className="rounded-lg border bg-surface">
          <EmptyState message="Your role does not include this screen. Ask a Director for access." action={{ label: "Back to dashboard", href: "/dashboard" }} />
        </div>
      </>
    );
  }
  const [ledger, canUpdate] = await Promise.all([loadLedger(), can(user, "money_locked", "EDIT")]);
  const summary = await getMoneyLockedSummary(ledger);
  return <MoneyLockedView ledger={ledger} series={summary.series} canUpdate={canUpdate} />;
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Content />
    </Suspense>
  );
}
