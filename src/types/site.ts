import type { BaseEntity, Id, IsoDate, IsoDateTime, Money } from "./common";

export type SiteStatus = "ACTIVE" | "ON_HOLD" | "COMPLETED";

/** A named plant site (e.g. "NTPC Korba"). Several projects can run at one plant. */
export interface Site extends BaseEntity {
  organisationId: Id;
  regionId: Id;
  stateId: Id;
  code: string;
  name: string;
  address: string;
  /** "HH:mm" IST; a submitted daily report is expected before this time. */
  reportCutoffTime: string;
  status: SiteStatus;
}

export interface BoqItem extends BaseEntity {
  projectId: Id;
  itemNo: string;
  description: string;
  unit: string;
  quantity: string;
  rate: Money;
  amount: Money;
  /** Cached from daily reports (indicative). Official figure comes from RA bill measurements. */
  executedQty: string;
}

export type DailyReportStatus = "DRAFT" | "SUBMITTED" | "REVIEWED";

export interface DailyWorkReport extends BaseEntity {
  siteId: Id;
  projectId: Id;
  regionId: Id;
  reportDate: IsoDate;
  status: DailyReportStatus;
  workersCount: number;
  issues?: string | null;
  planForTomorrow?: string | null;
  photoCount: number;
  submittedById: Id;
  submittedAt?: IsoDateTime | null;
  reviewedById?: Id | null;
  reviewComment?: string | null;
}

export interface DailyWorkItem extends BaseEntity {
  reportId: Id;
  boqItemId: Id;
  plannedQty: string;
  completedQty: string;
}

export type IssueSeverity = "LOW" | "MEDIUM" | "HIGH";
export type IssueStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";

/** Feeds "major issues" on the dashboard. */
export interface SiteIssue extends BaseEntity {
  siteId: Id;
  projectId: Id;
  regionId: Id;
  reportId?: Id | null;
  title: string;
  severity: IssueSeverity;
  status: IssueStatus;
  raisedById: Id;
  raisedOn: IsoDate;
  resolvedAt?: IsoDateTime | null;
}

/** Planned cost per expense category; actuals come from CostEntry. */
export interface ProjectBudgetLine extends BaseEntity {
  projectId: Id;
  expenseCategoryId: Id;
  plannedAmount: Money;
}

export interface ExpenseCategory extends BaseEntity {
  name: string;
  isActive: boolean;
}

export type CostEntryKind = "COMMITTED" | "ACTUAL";

/** Read model so budget-vs-actual is one query. */
export interface CostEntry extends BaseEntity {
  projectId: Id;
  siteId?: Id | null;
  regionId: Id;
  expenseCategoryId: Id;
  kind: CostEntryKind;
  sourceType: string;
  sourceId: Id;
  amount: Money;
  date: IsoDate;
}

export interface ProjectMember extends BaseEntity {
  projectId: Id;
  employeeId: Id;
  roleLabel: string;
  fromDate: IsoDate;
  toDate?: IsoDate | null;
}
