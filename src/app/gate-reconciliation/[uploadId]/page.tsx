import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { ExceptionsTable } from "@/components/gate-reconciliation/exceptions-table";
import { UploadState } from "@/components/gate-reconciliation/gate-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { decodeRouteId } from "@/lib/data/links";
import { formatMonth } from "@/lib/dates";
import { moduleAccess } from "@/modules/bid-pricing/feature";
import { summaryText } from "@/modules/gate-reconciliation/match";
import { getUploadDetail } from "@/modules/gate-reconciliation/queries";

export const metadata: Metadata = { title: "Gate reconciliation" };

async function Body({ params }: { params: Promise<{ uploadId: string }> }) {
  const { uploadId } = await params;
  const [access, detail] = await Promise.all([moduleAccess("gate_reconciliation"), getUploadDetail(decodeRouteId(uploadId))]);
  if (!detail) notFound();
  const { upload, status, exceptions } = detail;
  return (
    <>
      <PageHeader
        title={`${upload.projectCode} · ${formatMonth(upload.periodMonth)}`}
        status={<UploadState openExceptions={status.openExceptions} />}
        description={`${upload.projectName} · ${upload.fileName}`}
      />
      <p className="mb-4 text-sm" data-testid="gate-summary">
        <span className="tabular font-medium">{summaryText(status.matchedPct ?? 100, status.totalExceptions)}</span>
        <span className="text-muted-foreground"> · {status.openExceptions} open · {upload.rowCount.toLocaleString("en-IN")} gate rows</span>
      </p>
      <ExceptionsTable exceptions={exceptions} canResolve={access.canUpdate} />
    </>
  );
}

export default function Page({ params }: { params: Promise<{ uploadId: string }> }) {
  return (
    <>
      <Link href="/gate-reconciliation" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-accent-strong hover:underline sm:min-h-0">
        <ArrowLeft className="size-4" aria-hidden="true" /> All reconciliations
      </Link>
      <Suspense fallback={null}>
        <Body params={params} />
      </Suspense>
    </>
  );
}
