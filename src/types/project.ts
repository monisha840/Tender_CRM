import type { BaseEntity, Id, IsoDate, IsoDateTime, Money } from "./common";

export type HealthStatus = "GREEN" | "AMBER" | "RED";

export interface ProjectStatus extends BaseEntity {
  name: string;
  sequence: number;
  systemKey?: string | null;
  isActive: boolean;
}

export type ContractType = "SERVICE" | "FIXED_SCOPE";
export type BillingCycle = "MONTHLY" | "MILESTONE" | "ON_COMPLETION";

/**
 * A work order from a customer organisation: either a multi-year service contract billed monthly
 * or a fixed-scope job billed on milestones. Billing and payment totals come from its invoices.
 */
export interface Project extends BaseEntity {
  code: string;
  name: string;
  serviceLineId: Id;
  /** The plant site where the work is carried out. */
  siteId: Id;
  contractType: ContractType;
  /** Customer's work order / LoA number. */
  workOrderNo: string;
  workOrderDate: IsoDate;
  billingCycle: BillingCycle;
  /** Days after invoice date by which the customer should pay. */
  paymentTermsDays: number;
  /** Unique and nullable: one tender gives at most one project. */
  tenderId?: Id | null;
  organisationId: Id;
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
