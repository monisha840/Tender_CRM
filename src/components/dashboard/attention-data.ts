import { canView, getPendingApprovalsFor, getSalaryPending, getUpcomingTenderDeadlines, listReceivables, type RegionFilter } from "@/lib/data";
import { inRegion } from "@/lib/data/shared";
import { isModuleEnabled } from "@/lib/features";
import { moneyToNumber } from "@/lib/money";
import type { Database, Id } from "@/types";

/** Where each "needs attention" block sends the user. One list, so the dashboard never links to two different filters. */
export const ATTENTION_HREF = {
  deadlines: "/tenders/deadlines",
  approvals: "/approvals",
  receivables: "/finance?view=receivables&overdue=1",
  salaryPending: "/employees?salary=pending",
  salaryOnHold: "/employees?salary=on-hold",
  payroll: "/employees/payroll",
} as const;

export interface AttentionData {
  /** Bids closing within the horizon; null when the user cannot open tenders. */
  deadlines: ReturnType<typeof getUpcomingTenderDeadlines> | null;
  /** Approvals waiting for this user; null when the user cannot open approvals. */
  approvals: ReturnType<typeof getPendingApprovalsFor> | null;
  /** Overdue customer invoices, largest balance first; null when the user cannot open finance. */
  overdue: ReturnType<typeof listReceivables> | null;
  /** Salary position of the latest payroll month; null when the user cannot open employees. */
  salary: ReturnType<typeof getSalaryPending> | null;
}

/**
 * The single source for "Needs attention": deadlines this week, approvals waiting on the user, overdue receivables and
 * salary pending, each gated by what the user may open. The attention blocks and the Do-next queue both read from here.
 */
export function getAttention(db: Database, userId: Id, region: RegionFilter, horizonDays = 7): AttentionData {
  return {
    deadlines: canView(db, userId, "tenders") ? getUpcomingTenderDeadlines(db, region, horizonDays) : null,
    approvals: canView(db, userId, "approvals") ? getPendingApprovalsFor(db, userId).filter((a) => inRegion(region, a.request.regionId)) : null,
    overdue: isModuleEnabled("finance") && canView(db, userId, "finance")
      ? listReceivables(db, region)
          .filter((r) => r.daysOverdue > 0)
          .sort((a, b) => moneyToNumber(b.outstanding) - moneyToNumber(a.outstanding))
      : null,
    salary: isModuleEnabled("employees") && canView(db, userId, "employees") ? getSalaryPending(db, region) : null,
  };
}
