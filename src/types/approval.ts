import type { BaseEntity, Id, IsoDateTime, Money } from "./common";

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "CHANGES_REQUESTED";

/**
 * MVP subset of the generic approval engine: enough for GO/NO-GO and the
 * dashboard's "pending approvals". Flow/level configuration is not modelled yet.
 */
export interface ApprovalRequest extends BaseEntity {
  entityType: string;
  entityId: Id;
  amount?: Money | null;
  regionId: Id;
  projectId?: Id | null;
  title: string;
  requestedById: Id;
  status: ApprovalStatus;
  currentSequence: number;
  submittedAt: IsoDateTime;
  completedAt?: IsoDateTime | null;
}

export interface ApprovalStep extends BaseEntity {
  requestId: Id;
  sequence: number;
  assignedUserId?: Id | null;
  status: ApprovalStatus;
  dueAt?: IsoDateTime | null;
}

export type ApprovalActionType =
  | "APPROVE"
  | "REJECT"
  | "DELEGATE"
  | "REASSIGN"
  | "COMMENT"
  | "REQUEST_CHANGES";

/** Append-only; drives the approval timeline. */
export interface ApprovalAction extends BaseEntity {
  stepId: Id;
  actorId: Id;
  action: ApprovalActionType;
  comment?: string | null;
  at: IsoDateTime;
}

/** Approval routing threshold: the role that may approve a flow up to `maxAmount`. (Unused by the minimal 2-role version.) */
export interface ApprovalThreshold extends BaseEntity {
  flowId: Id;
  roleId: Id;
  maxAmount: Money;
}
