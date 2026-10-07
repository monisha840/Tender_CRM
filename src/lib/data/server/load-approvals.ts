/**
 * Server-only loader: approval engine tables into `Database` shapes.
 *
 * `approvalRequests`, `approvalSteps`, `approvalActions` are `Database` keys. Flow configuration
 * (`approvalFlows`, `approvalFlowLevels`, `approvalThresholds`) has no `Database` table yet, so it is
 * returned as extra keys with the types declared here (see docs/shared-changes.md).
 *
 * Mapping: amount Decimal(14,2) -> money string; timestamps -> ISO; enums pass through.
 * Scope: requests filtered by regionId AND projectId; steps/actions follow the loaded requests.
 * Note: requests with a null projectId (e.g. GO/NO-GO) are excluded when `projectIds` is supplied.
 */
import type { PrismaClient } from "@prisma/client";
import type { Database } from "@/types/database";
import {
  base,
  inIds,
  iso,
  isoOrNull,
  liveWhere,
  money,
  moneyOrNull,
  type BaseRow,
  type DecimalLike,
  type LoadScope,
} from "./convert";

export interface ApprovalFlowRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  key: string;
  name: string;
  entityType: string;
  isActive: boolean;
}
export interface ApprovalFlowLevelRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  flowId: string;
  sequence: number;
  name: string;
  approverRoleId: string;
  regionScoped: boolean;
  mode: "ANY" | "ALL";
  allowSelfApproval: boolean;
  slaHours?: number | null;
}
export type ApprovalThresholdRecord = Database["approvalThresholds"][number];

export type ApprovalsSlice = Pick<Database, "approvalRequests" | "approvalSteps" | "approvalActions"> & {
  approvalFlows: ApprovalFlowRecord[];
  approvalFlowLevels: ApprovalFlowLevelRecord[];
  approvalThresholds: ApprovalThresholdRecord[];
};

// ---- Row shapes -------------------------------------------------------------

export interface ApprovalRequestRow extends BaseRow {
  entityType: string;
  entityId: string;
  amount: DecimalLike | null;
  regionId: string;
  projectId: string | null;
  title: string;
  requestedById: string;
  status: Database["approvalRequests"][number]["status"];
  currentSequence: number;
  submittedAt: Date;
  completedAt: Date | null;
}
export interface ApprovalStepRow extends BaseRow {
  requestId: string;
  sequence: number;
  assignedUserId: string | null;
  status: Database["approvalSteps"][number]["status"];
  dueAt: Date | null;
}
export interface ApprovalActionRow extends BaseRow {
  stepId: string;
  actorId: string;
  action: Database["approvalActions"][number]["action"];
  comment: string | null;
  at: Date;
}
export interface ApprovalFlowRow extends BaseRow {
  key: string;
  name: string;
  entityType: string;
  isActive: boolean;
}
export interface ApprovalFlowLevelRow extends BaseRow {
  flowId: string;
  sequence: number;
  name: string;
  approverRoleId: string;
  regionScoped: boolean;
  mode: "ANY" | "ALL";
  allowSelfApproval: boolean;
  slaHours: number | null;
}
export interface ApprovalThresholdRow extends BaseRow {
  flowId: string;
  roleId: string;
  maxAmount: DecimalLike;
}

// ---- Pure mappers -----------------------------------------------------------

export const mapApprovalRequest = (r: ApprovalRequestRow): Database["approvalRequests"][number] => ({
  ...base(r),
  entityType: r.entityType,
  entityId: r.entityId,
  amount: moneyOrNull(r.amount),
  regionId: r.regionId,
  projectId: r.projectId,
  title: r.title,
  requestedById: r.requestedById,
  status: r.status,
  currentSequence: r.currentSequence,
  submittedAt: iso(r.submittedAt),
  completedAt: isoOrNull(r.completedAt),
});

export const mapApprovalStep = (r: ApprovalStepRow): Database["approvalSteps"][number] => ({
  ...base(r),
  requestId: r.requestId,
  sequence: r.sequence,
  assignedUserId: r.assignedUserId,
  status: r.status,
  dueAt: isoOrNull(r.dueAt),
});

export const mapApprovalAction = (r: ApprovalActionRow): Database["approvalActions"][number] => ({
  ...base(r),
  stepId: r.stepId,
  actorId: r.actorId,
  action: r.action,
  comment: r.comment,
  at: iso(r.at),
});

export const mapApprovalFlow = (r: ApprovalFlowRow): ApprovalFlowRecord => ({
  ...base(r),
  key: r.key,
  name: r.name,
  entityType: r.entityType,
  isActive: r.isActive,
});

export const mapApprovalFlowLevel = (r: ApprovalFlowLevelRow): ApprovalFlowLevelRecord => ({
  ...base(r),
  flowId: r.flowId,
  sequence: r.sequence,
  name: r.name,
  approverRoleId: r.approverRoleId,
  regionScoped: r.regionScoped,
  mode: r.mode,
  allowSelfApproval: r.allowSelfApproval,
  slaHours: r.slaHours,
});

export const mapApprovalThreshold = (r: ApprovalThresholdRow): ApprovalThresholdRecord => ({
  ...base(r),
  flowId: r.flowId,
  roleId: r.roleId,
  maxAmount: money(r.maxAmount),
});

// ---- Loader -----------------------------------------------------------------

export async function loadApprovals(prisma: PrismaClient, scope?: LoadScope): Promise<ApprovalsSlice> {
  const live = liveWhere(scope);
  const reqWhere = { ...live, regionId: inIds(scope?.regionIds), projectId: inIds(scope?.projectIds) };

  const [flows, levels, thresholds, requests] = await Promise.all([
    prisma.approvalFlow.findMany({ where: live, orderBy: { key: "asc" } }),
    prisma.approvalFlowLevel.findMany({ where: live, orderBy: [{ flowId: "asc" }, { sequence: "asc" }] }),
    prisma.approvalThreshold.findMany({ where: live }),
    prisma.approvalRequest.findMany({ where: reqWhere, orderBy: { submittedAt: "asc" } }),
  ]);

  const requestIds = requests.map((r) => r.id);
  const steps = await prisma.approvalStep.findMany({
    where: { ...live, requestId: { in: requestIds } },
    orderBy: [{ requestId: "asc" }, { sequence: "asc" }],
  });
  const actions = await prisma.approvalAction.findMany({
    where: { ...live, stepId: { in: steps.map((s) => s.id) } },
    orderBy: { at: "asc" },
  });

  return {
    approvalFlows: flows.map(mapApprovalFlow),
    approvalFlowLevels: levels.map(mapApprovalFlowLevel),
    approvalThresholds: thresholds.map(mapApprovalThreshold),
    approvalRequests: requests.map(mapApprovalRequest),
    approvalSteps: steps.map(mapApprovalStep),
    approvalActions: actions.map(mapApprovalAction),
  };
}
