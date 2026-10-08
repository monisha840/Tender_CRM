import type { Metadata } from "next";
import { Suspense } from "react";
import { BillReadinessChecklist } from "@/components/bill-readiness/checklist";
import { EmptyState } from "@/components/shared/empty-state";
import { prisma } from "@/lib/server/prisma";
import { moduleAccess } from "@/modules/documents/access";
import { currentMonth, loadChecklist } from "@/modules/bill-readiness/queries";
import { isPeriodMonth } from "@/modules/bill-readiness/readiness";

export const metadata: Metadata = { title: "Bill readiness" };

type Props = { params: Promise<{ projectId: string }>; searchParams: Promise<{ month?: string }> };

async function Detail({ params, searchParams }: Props) {
  const access = await moduleAccess("bill_readiness");
  const notFound = (
    <div className="rounded-lg border bg-surface">
      <EmptyState message="This project was not found, or your role cannot view it." action={{ label: "Back to bill readiness", href: "/bill-readiness" }} />
    </div>
  );
  if (!access.canView) return notFound;
  const [{ projectId }, { month: m }] = await Promise.all([params, searchParams]);
  const month = m && isPeriodMonth(m) ? m : currentMonth();
  const [project, checklist] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true, code: true, name: true } }),
    loadChecklist(projectId, month),
  ]);
  if (!project || !checklist) return notFound;
  return <BillReadinessChecklist project={project} rows={checklist.rows} status={checklist.status} month={month} canUpdate={access.canUpdate} />;
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={null}>
      <Detail {...props} />
    </Suspense>
  );
}
