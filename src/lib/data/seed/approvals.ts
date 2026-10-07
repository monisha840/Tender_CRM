import { DEMO_TODAY, addDays } from "@/lib/dates";
import type { ApprovalStatus, Id, IsoDate, Money } from "@/types";
import { at, meta, type SeedCtx } from "./helpers";

export interface ApprovalInput {
  id: Id;
  entityType: string;
  entityId: Id;
  amount?: Money | null;
  regionId: Id;
  projectId?: Id | null;
  title: string;
  requestedById: Id;
  approverId: Id;
  status: ApprovalStatus;
  submittedOn: IsoDate;
  decidedOn?: IsoDate;
  comment?: string;
}

/** Creates a single-step approval (request + step + action when decided) via the generic engine tables. */
export function addApproval({ db }: SeedCtx, o: ApprovalInput): Id {
  const decided = o.status !== "PENDING";
  db.approvalRequests.push({
    ...meta(o.id),
    entityType: o.entityType,
    entityId: o.entityId,
    amount: o.amount ?? null,
    regionId: o.regionId,
    projectId: o.projectId ?? null,
    title: o.title,
    requestedById: o.requestedById,
    status: o.status,
    currentSequence: 1,
    submittedAt: at(o.submittedOn, "12:00"),
    completedAt: decided ? at(o.decidedOn ?? o.submittedOn, "16:00") : null,
  });
  db.approvalSteps.push({
    ...meta(`${o.id}_s1`),
    requestId: o.id,
    sequence: 1,
    assignedUserId: o.approverId,
    status: o.status,
    dueAt: decided ? null : at(addDays(DEMO_TODAY, 2), "18:00"),
  });
  if (decided) {
    db.approvalActions.push({
      ...meta(`${o.id}_a1`),
      stepId: `${o.id}_s1`,
      actorId: o.approverId,
      action: o.status === "REJECTED" ? "REJECT" : "APPROVE",
      comment: o.comment ?? null,
      at: at(o.decidedOn ?? o.submittedOn, "16:00"),
    });
  }
  return o.id;
}
