import "server-only";
// Server-only: never import from client components.
import type { Prisma } from "@prisma/client";
import { AuthError, type SessionUser } from "@/lib/server/auth-types";

export type Tx = Prisma.TransactionClient;

export type AuditInput = {
  /** Actor; null for SYSTEM/JOB writes. */
  user: SessionUser | null;
  /** Dotted verb, e.g. "tender.create", "tender.update", "approval.approve". */
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  summary?: string;
  regionId?: string | null;
  projectId?: string | null;
  approvalRequestId?: string | null;
  /** Force a reason even if the heuristics in `needsReason` would not. */
  reasonRequired?: boolean;
};

/** Actions that always need a reason: approvals, results, stage results, amount changes. */
const REASON_ACTION = /(^|[._:-])(approval|approve|reject|result|stage[_.-]?result|amount)([._:-]|$)/i;
/** Fields whose change is a money change. */
const AMOUNT_FIELD = /(amount|value|rate|price|total|retention)/i;

/** Plain JSON copy (Decimal -> string, Date -> ISO) so before/after are safe to store. */
function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

export function changedFields(before: unknown, after: unknown): string[] {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  return [...keys].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k])).sort();
}

/** True when this audit entry must carry a reason (amount / approval / result / stage-result changes). */
export function needsReason(action: string, before?: unknown, after?: unknown): boolean {
  if (REASON_ACTION.test(action)) return true;
  if (/\.(update|edit)$/i.test(action)) return changedFields(before, after).some((f) => AMOUNT_FIELD.test(f));
  return false;
}

/** Returns the trimmed reason or throws AuthError("REASON_REQUIRED"). */
export function requireReason(reason: string | null | undefined, what = "This change"): string {
  const r = reason?.trim();
  if (!r) throw new AuthError("REASON_REQUIRED", `${what} requires a reason`);
  return r;
}

/**
 * Appends one audit row INSIDE the caller's transaction (so the change and its audit commit or roll back together).
 * The AuditLog table is append-only (DB trigger): app code only ever inserts.
 */
export async function writeAudit(tx: Tx, e: AuditInput): Promise<void> {
  const reason = e.reasonRequired || needsReason(e.action, e.before, e.after) ? requireReason(e.reason, e.action) : (e.reason?.trim() || null);
  await tx.auditLog.create({
    data: {
      actorId: e.user?.id ?? null,
      actorType: e.user ? "USER" : "SYSTEM",
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      regionId: e.regionId ?? null,
      projectId: e.projectId ?? null,
      summary: e.summary ?? `${e.action} ${e.entityType} ${e.entityId}`,
      before: toJson(e.before),
      after: toJson(e.after),
      changedFields: e.before && e.after ? changedFields(e.before, e.after) : [],
      reason,
      approvalRequestId: e.approvalRequestId ?? null,
    },
  });
}
