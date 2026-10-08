import { addDays, getToday, istToUtc, nowIso } from "@/lib/dates";
import { byId } from "@/lib/data/shared";
import { isPositive } from "@/lib/money";
import { parseMoney } from "@/modules/finance/entry";
import type { ApprovalRequest, ApprovalStep, Database } from "@/types";

/** Request types that already have a label and landing page in the approvals inbox. */
export const REQUEST_TYPES = [
  { value: "PURCHASE_REQUEST", label: "Purchase request" },
  { value: "PURCHASE_ORDER", label: "Purchase order" },
  { value: "SUBCONTRACTOR_BILL", label: "Subcontractor bill" },
  { value: "PAYROLL_RUN", label: "Payroll run" },
];

export interface ApprovalEntry {
  entityType: string;
  title: string;
  amount: string;
  regionId: string;
  projectId: string;
  approverId: string;
  requestedById: string;
  /** Settings > Approvals > due days (default 2); the caller passes the configured value. */
  dueDays?: number;
}

export type ApprovalBuild = { ok: true; request: ApprovalRequest; step: ApprovalStep } | { ok: false; error: string };

/** One request with a single pending step, the same shape as the seeded requests, so inbox approve / reject works. */
export function buildApprovalRequest(db: Database, e: ApprovalEntry): ApprovalBuild {
  const fail = (error: string): ApprovalBuild => ({ ok: false, error });
  if (!REQUEST_TYPES.some((t) => t.value === e.entityType)) return fail("Choose a request type");
  if (!e.title.trim()) return fail("Title is required");
  if (!byId(db.regions, e.regionId)) return fail("Choose a region");
  const approver = byId(db.users, e.approverId);
  if (!approver || !approver.isActive) return fail("Choose an approver");
  let amount: string | null = null;
  if (e.amount.trim() !== "") {
    amount = parseMoney(e.amount);
    if (!amount || !isPositive(amount)) return fail("Amount must be a positive number");
  }
  if (e.projectId && !byId(db.projects, e.projectId)) return fail("Project not found");
  const now = nowIso();
  const id = `apr_new_${Date.now()}`;
  return {
    ok: true,
    request: {
      id,
      createdAt: now,
      updatedAt: now,
      entityType: e.entityType,
      entityId: id,
      amount,
      regionId: e.regionId,
      projectId: e.projectId || null,
      title: e.title.trim(),
      requestedById: e.requestedById,
      status: "PENDING",
      currentSequence: 1,
      submittedAt: now,
      completedAt: null,
    },
    step: {
      id: `${id}_s1`,
      createdAt: now,
      updatedAt: now,
      requestId: id,
      sequence: 1,
      assignedUserId: approver.id,
      status: "PENDING",
      dueAt: istToUtc(addDays(getToday(), e.dueDays ?? 2), "18:00"),
    },
  };
}
