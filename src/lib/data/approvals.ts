import type { ApprovalRequest, ApprovalStatus, Database, Id } from "@/types";
import { entityHref, ENTITY_LABEL } from "./links";
import { byId, inRegion, type RegionFilter } from "./shared";

export interface ApprovalRow {
  request: ApprovalRequest;
  typeLabel: string;
  href: string;
  requestedBy: string;
  assignedToId: Id | null;
  assignedToName: string;
  dueAt: string | null;
  regionName: string;
}

export interface ApprovalFilters {
  region?: RegionFilter;
  status?: ApprovalStatus;
  assignedToId?: Id;
}

export function listApprovals(db: Database, filters: ApprovalFilters = {}): ApprovalRow[] {
  return db.approvalRequests
    .filter((r) => !r.deletedAt && inRegion(filters.region ?? "ALL", r.regionId) && (!filters.status || r.status === filters.status))
    .map((request): ApprovalRow => {
      const step = db.approvalSteps.find((s) => s.requestId === request.id && s.sequence === request.currentSequence);
      return {
        request,
        typeLabel: ENTITY_LABEL[request.entityType] ?? request.entityType,
        href: entityHref(request.entityType, request.entityId),
        requestedBy: byId(db.users, request.requestedById)?.name ?? "—",
        assignedToId: step?.assignedUserId ?? null,
        assignedToName: byId(db.users, step?.assignedUserId)?.name ?? "—",
        dueAt: step?.dueAt ?? null,
        regionName: byId(db.regions, request.regionId)?.name ?? "—",
      };
    })
    .filter((r) => !filters.assignedToId || r.assignedToId === filters.assignedToId)
    .sort((a, b) => b.request.submittedAt.localeCompare(a.request.submittedAt));
}

/** Pending approvals waiting on this user, oldest first. */
export function getPendingApprovalsFor(db: Database, userId: Id): ApprovalRow[] {
  return listApprovals(db, { status: "PENDING", assignedToId: userId }).sort((a, b) =>
    a.request.submittedAt.localeCompare(b.request.submittedAt),
  );
}

/** Steps and actions for the approval history timeline. */
export function getApprovalTimeline(db: Database, requestId: Id) {
  const request = byId(db.approvalRequests, requestId);
  if (!request) return [];
  const events = [
    { at: request.submittedAt, label: "Submitted for approval", by: byId(db.users, request.requestedById)?.name ?? "—", comment: null as string | null },
    ...db.approvalActions
      .filter((a) => db.approvalSteps.some((s) => s.id === a.stepId && s.requestId === requestId))
      .map((a) => ({ at: a.at, label: a.action === "APPROVE" ? "Approved" : a.action === "REJECT" ? "Rejected" : a.action, by: byId(db.users, a.actorId)?.name ?? "—", comment: a.comment ?? null })),
  ];
  return events.sort((a, b) => a.at.localeCompare(b.at));
}
