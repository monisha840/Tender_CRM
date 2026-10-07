"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { DeadlineBadge } from "@/components/shared/status-badge";
import { relativeDeadline } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import type { PfStatus } from "@/lib/data";

/** True when PF is unremitted and due within `days` days (or already overdue). */
export const pfNeedsAttention = (pf: PfStatus, days: number) =>
  !!pf.dueDate && pf.status !== "REMITTED" && relativeDeadline(pf.dueDate).days <= days;

/** Danger banner: PF unremitted and due in 3 days or less, or overdue. */
export function PfBanner({ pf, href }: { pf: PfStatus; href?: string }) {
  if (!pf.dueDate || !pfNeedsAttention(pf, 3)) return null;
  const overdue = relativeDeadline(pf.dueDate).days < 0;
  return (
    <div role="alert" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-status-danger bg-status-danger-tint px-3 py-2 text-sm text-status-danger">
      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {overdue ? "PF payment is overdue" : "PF payment is due soon"}: {formatINR(pf.total)} for {pf.members} members.
        {href && (
          <>
            {" "}
            <Link href={href} className="font-medium underline">View PF status</Link>
          </>
        )}
      </p>
      <DeadlineBadge value={pf.dueDate} />
    </div>
  );
}
