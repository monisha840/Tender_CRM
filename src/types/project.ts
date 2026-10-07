import type { BaseEntity, Id, IsoDate, IsoDateTime, Money } from "./common";

export type HealthStatus = "GREEN" | "AMBER" | "RED";

export interface ProjectStatus extends BaseEntity {
  name: string;
  sequence: number;
  systemKey?: string | null;
  isActive: boolean;
}

/**
 * MVP stub: only what the tender -> project conversion fills in and the
 * dashboard lists. Sites, BOQ, team and daily reports arrive in Phase 2.
 */
export interface Project extends BaseEntity {
  code: string;
  name: string;
  /** Unique and nullable: one tender gives at most one project. */
  tenderId?: Id | null;
  clientId: Id;
  regionId: Id;
  gstRegistrationId: Id;
  contractValue: Money;
  startDate?: IsoDate | null;
  plannedEndDate?: IsoDate | null;
  statusId: Id;
  projectManagerId?: Id | null;
  healthOverride?: HealthStatus | null;
}

/** Provenance record written by the convert action. */
export interface ProjectConversion extends BaseEntity {
  tenderId: Id;
  projectId: Id;
  convertedById: Id;
  convertedAt: IsoDateTime;
  /** Tender, bid and award values copied at conversion time. */
  snapshot: Record<string, unknown>;
  /** Required when converting with unmet mandatory award conditions. */
  overrideReason?: string | null;
  approvalRequestId?: Id | null;
}
