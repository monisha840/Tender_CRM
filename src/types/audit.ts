import type { BaseEntity, Id, IsoDateTime } from "./common";

/** Append-only. Amounts, approvals, tender results and payroll changes require `reason`. */
export interface AuditLog extends BaseEntity {
  occurredAt: IsoDateTime;
  actorId?: Id | null;
  actorType: "USER" | "SYSTEM";
  action: string;
  entityType: string;
  entityId: Id;
  regionId?: Id | null;
  projectId?: Id | null;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}
