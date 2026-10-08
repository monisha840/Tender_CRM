import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ContractPnlView } from "@/components/contract-pnl/contract-pnl-view";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/server/permissions";
import { getPortfolioPnl } from "@/modules/contract-pnl/service";

export const metadata: Metadata = { title: "Contract P&L" };

async function Content() {
  const user = await requireUser();
  if (!(await can(user, "contract_pnl", "VIEW"))) {
    return (
      <>
        <PageHeader title="Contract P&L" />
        <div className="rounded-lg border bg-surface">
          <EmptyState message="Your role does not include this screen. Ask a Director for access." action={{ label: "Back to dashboard", href: "/dashboard" }} />
        </div>
      </>
    );
  }
  return <ContractPnlView data={await getPortfolioPnl()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Content />
    </Suspense>
  );
}
