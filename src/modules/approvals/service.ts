// Server-only: never import from client components.
import type { ApprovalRequest } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/server/prisma";
import { AuthError, type SessionUser } from "@/lib/server/auth-types";
import { assertCan } from "@/lib/server/permissions";
import { requireReason, writeAudit, type Tx } from "@/lib/server/audit";
import { ServiceError } from "@/lib/server/service";

/**
 * The one generic approval engine. Minimal scope: every request is ONE pending step assigned to the Director role.
 * Modules never build their own approval logic: they call `submitForApproval` from their service (inside their own
 * transaction) and register a handler that updates the source record when the Director decides.
 */

const DIRECTOR_ROLE_KEY = "director";

// ---------------------------------------------------------------------------
// Handler registry
// ---------------------------------------------------------------------------

export type ApprovalDecisionContext = {
  request: ApprovalRequest;
  /** The deciding user. */
  user: SessionUser;
  /** Decision comment; always present on rejection. */
  reason: string | null;
};
export type ApprovalHandler = {
  onApproved: (tx: Tx, ctx: ApprovalDecisionContext) => Promise<void>;
  onRejected: (tx: Tx, ctx: ApprovalDecisionContext) => Promise<void>;
};

const handlers = new Map<string, ApprovalHandler>();

/** Each module registers once at import time, keyed by the `entityType` it passes to `submitForApproval`. */
export function registerApprovalHandler(entityType: string, handler: ApprovalHandler) {
  handlers.set(entityType, handler);
}
export function unregisterApprovalHandler(entityType: string) {
  handlers.delete(entityType);
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

export type SubmitInput = {
  /** ApprovalFlow.key, e.g. "GO_NO_GO". */
  flowKey: string;
  /** Registered handler key, e.g. "TENDER_GO_NO_GO". */
  entityType: string;
  entityId: string;
  /** Shown in the Director's inbox. */
  summary: string;
  amount?: string | number | null;
  /** Defaults to the first active region when the request is not region-specific. */
  regionId?: string;
  projectId?: string | null;
};

/**
 * Creates the request and its single Director step, notifies the directors and audits, all in the caller's
 * transaction. The caller has already checked its own module permission (e.g. tenders:SUBMIT).
 */
export async function submitForApproval(tx: Tx, user: SessionUser, input: SubmitInput) {
  const flow = await tx.approvalFlow.findFirst({ where: { key: input.flowKey, isActive: true, deletedAt: null } });
  if (!flow) throw new ServiceError("NOT_FOUND", `Approval flow ${input.flowKey} is not configured`);
  const director = await tx.role.findFirst({ where: { key: DIRECTOR_ROLE_KEY, isActive: true, deletedAt: null } });
  if (!director) throw new ServiceError("NOT_FOUND", "Director role is not configured");

  const pending = await tx.approvalRequest.findFirst({
    where: { entityType: input.entityType, entityId: input.entityId, status: "PENDING", deletedAt: null },
    select: { id: true },
  });
  if (pending) throw new ServiceError("CONFLICT", "An approval request for this record is already pending");

  const regionId =
    input.regionId ?? (await tx.region.findFirst({ where: { isActive: true, deletedAt: null }, orderBy: { id: "asc" }, select: { id: true } }))?.id;
  if (!regionId) throw new ServiceError("NOT_FOUND", "No active region configured");

  const level = await tx.approvalFlowLevel.findFirst({ where: { flowId: flow.id, approverRoleId: director.id, deletedAt: null }, orderBy: { sequence: "asc" } });
  const now = new Date();
  const request = await tx.approvalRequest.create({
    data: {
      flowId: flow.id,
      entityType: input.entityType,
      entityId: input.entityId,
      amount: input.amount ?? null,
      regionId,
      projectId: input.projectId ?? null,
      title: input.summary,
      requestedById: user.id,
      status: "PENDING",
      currentSequence: 1,
      submittedAt: now,
      createdById: user.id,
    },
  });
  await tx.approvalStep.create({
    data: { requestId: request.id, levelId: level?.id ?? null, sequence: 1, assignedRoleId: director.id, status: "PENDING", createdById: user.id },
  });

  const directors = await tx.userRole.findMany({
    where: { roleId: director.id, deletedAt: null, user: { isActive: true, deletedAt: null, id: { not: user.id } } },
    select: { userId: true },
  });
  if (directors.length > 0) {
    await tx.notification.createMany({
      data: directors.map((d) => ({
        userId: d.userId,
        type: "APPROVAL_REQUESTED",
        title: "Approval needed",
        body: input.summary,
        entityType: "ApprovalRequest",
        entityId: request.id,
        dedupeKey: `approval-requested:${request.id}:${d.userId}`,
      })),
      skipDuplicates: true,
    });
  }

  await writeAudit(tx, {
    user,
    action: "approval.submit",
    entityType: input.entityType,
    entityId: input.entityId,
    after: { requestId: request.id, flow: input.flowKey, status: "PENDING", amount: input.amount ?? null },
    reason: input.summary, // submitting is an approval event; the summary doubles as its reason
    summary: `Submitted for approval: ${input.summary}`,
    regionId,
    projectId: input.projectId ?? null,
    approvalRequestId: request.id,
  });
  return request;
}

// ---------------------------------------------------------------------------
// Decide
// ---------------------------------------------------------------------------

export const decideSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["APPROVE", "REJECT"]),
  /** Required for REJECT (and therefore for every NO-GO). Optional comment on approval. */
  reason: z.string().trim().optional(),
});
export type DecideInput = z.infer<typeof decideSchema>;

/**
 * Director decision. Order of checks: permission (approvals:APPROVE/REJECT, so the Admin gets FORBIDDEN) ->
 * reason on reject -> maker-checker (requester can never decide their own request) -> request still pending.
 * The module handler runs in the same transaction, so the source record and the decision commit together.
 */
export async function decide(user: SessionUser, rawInput: DecideInput) {
  const input = decideSchema.parse(rawInput);
  await assertCan(user, "approvals", input.decision);
  const reason = input.decision === "REJECT" ? requireReason(input.reason, "Rejecting") : input.reason?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const request = await tx.approvalRequest.findFirst({ where: { id: input.requestId, deletedAt: null }, include: { steps: true } });
    if (!request) throw new ServiceError("NOT_FOUND", "Approval request not found");
    if (request.requestedById === user.id) throw new AuthError("SELF_APPROVAL", "You cannot decide a request you submitted");
    if (request.status !== "PENDING") throw new ServiceError("CONFLICT", `This request is already ${request.status.toLowerCase()}`);

    const step = request.steps.find((s) => s.status === "PENDING" && s.sequence === request.currentSequence && !s.deletedAt);
    if (!step) throw new ServiceError("CONFLICT", "This request has no pending step");
    if (step.assignedUserId && step.assignedUserId !== user.id) throw new AuthError("FORBIDDEN", "This step is assigned to someone else");
    if (step.assignedRoleId) {
      const role = await tx.role.findUnique({ where: { id: step.assignedRoleId }, select: { key: true } });
      if (!role || !user.roleKeys.includes(role.key)) throw new AuthError("FORBIDDEN", "This step is assigned to another role");
    }

    const status = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const now = new Date();
    // Guarded transition: a concurrent decision makes count 0 instead of double-applying the handler.
    const moved = await tx.approvalRequest.updateMany({
      where: { id: request.id, status: "PENDING", version: request.version },
      data: { status, completedAt: now, updatedById: user.id, version: { increment: 1 } },
    });
    if (moved.count !== 1) throw new ServiceError("CONFLICT", "This request was just decided by someone else");
    await tx.approvalStep.update({ where: { id: step.id }, data: { status, updatedById: user.id, version: { increment: 1 } } });
    await tx.approvalAction.create({
      data: { stepId: step.id, actorId: user.id, action: input.decision, comment: reason, at: now },
    });

    const handler = handlers.get(request.entityType);
    if (!handler) throw new ServiceError("NOT_FOUND", `No approval handler registered for ${request.entityType}`);
    const ctx: ApprovalDecisionContext = { request: { ...request, status, completedAt: now }, user, reason };
    await (input.decision === "APPROVE" ? handler.onApproved(tx, ctx) : handler.onRejected(tx, ctx));

    await writeAudit(tx, {
      user,
      action: input.decision === "APPROVE" ? "approval.approve" : "approval.reject",
      entityType: request.entityType,
      entityId: request.entityId,
      before: { status: "PENDING" },
      after: { status },
      reason: reason ?? "Approved",
      summary: `${status === "APPROVED" ? "Approved" : "Rejected"}: ${request.title}`,
      regionId: request.regionId,
      projectId: request.projectId,
      approvalRequestId: request.id,
    });

    await tx.notification.createMany({
      data: [
        {
          userId: request.requestedById,
          type: "APPROVAL_DECIDED",
          title: status === "APPROVED" ? "Approved" : "Rejected",
          body: reason ? `${request.title}: ${reason}` : request.title,
          entityType: "ApprovalRequest",
          entityId: request.id,
          dedupeKey: `approval-decided:${request.id}`,
        },
      ],
      skipDuplicates: true,
    });
    return { requestId: request.id, status } as const;
  }, { timeout: 20000, maxWait: 10000 });
}
