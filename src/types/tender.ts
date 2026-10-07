import type { BaseEntity, Id, IsoDate, IsoDateTime, Money, Percent } from "./common";

// ---- Configurable masters (data, not code) --------------------------------

/** `kind` drives dashboards (win rate etc.); `systemKey` marks rows code depends on. */
export type TenderStageKind = "OPEN" | "WON" | "LOST" | "NO_GO" | "TERMINAL";

export interface TenderStage extends BaseEntity {
  name: string;
  sequence: number;
  kind: TenderStageKind;
  systemKey?: string | null;
  isActive: boolean;
}

export type TenderResultOutcome = "WON" | "LOST" | "NEUTRAL";

export interface TenderResult extends BaseEntity {
  name: string;
  outcome: TenderResultOutcome;
  isActive: boolean;
}

export interface TenderType extends BaseEntity {
  name: string;
  isActive: boolean;
}

export interface TenderPortal extends BaseEntity {
  name: string;
  url?: string | null;
}

export interface DocumentType extends BaseEntity {
  name: string;
  isActive: boolean;
}

// ---- Tender ---------------------------------------------------------------

export interface Tender extends BaseEntity {
  tenderNo: string;
  title: string;
  clientId: Id;
  regionId: Id;
  location: string;
  tenderTypeId: Id;
  portalId?: Id | null;
  sourceUrl?: string | null;
  estimatedValue: Money;
  emdAmount: Money;
  tenderFee: Money;
  publishedOn?: IsoDate | null;
  preBidAt?: IsoDateTime | null;
  submissionDeadlineAt: IsoDateTime;
  technicalOpeningAt?: IsoDateTime | null;
  financialOpeningAt?: IsoDateTime | null;
  currentStageId: Id;
  resultId?: Id | null;
  /** User who owns the tender. */
  ownerId: Id;
  /** Chosen GSTIN; carried to the project on conversion. */
  gstRegistrationId?: Id | null;
}

/** Powers the stage timeline. */
export interface TenderStageHistory extends BaseEntity {
  tenderId: Id;
  fromStageId?: Id | null;
  toStageId: Id;
  changedById: Id;
  changedAt: IsoDateTime;
  reason?: string | null;
}

export type GoNoGoValue = "GO" | "NO_GO";

export interface GoNoGoDecision extends BaseEntity {
  tenderId: Id;
  decision: GoNoGoValue;
  decidedById: Id;
  decidedAt: IsoDateTime;
  /** Mandatory when decision is NO_GO. */
  reason?: string | null;
  approvalRequestId?: Id | null;
}

export type TenderDocumentStatus = "NOT_STARTED" | "IN_PROGRESS" | "READY" | "NA";

/** A checklist item on a specific tender. Files attach via DocumentLink. */
export interface TenderDocumentItem extends BaseEntity {
  tenderId: Id;
  name: string;
  documentTypeId: Id;
  isMandatory: boolean;
  status: TenderDocumentStatus;
  assigneeId?: Id | null;
  dueDate?: IsoDate | null;
}

// ---- EMD / PBG ------------------------------------------------------------

export type SecurityInstrumentType = "EMD" | "PBG" | "ADDITIONAL_PBG" | "SECURITY_DEPOSIT";
export type SecurityInstrumentMode = "DD" | "BG" | "ONLINE" | "FDR" | "EXEMPTION";
export type SecurityInstrumentStatus =
  | "ARRANGED"
  | "SUBMITTED"
  | "REFUNDED"
  | "ADJUSTED"
  | "FORFEITED"
  | "EXPIRED"
  | "RELEASED";

export interface SecurityInstrument extends BaseEntity {
  type: SecurityInstrumentType;
  tenderId: Id;
  /** Set on conversion (PBG moves to the project). */
  projectId?: Id | null;
  mode: SecurityInstrumentMode;
  amount: Money;
  instrumentNo?: string | null;
  bank?: string | null;
  issueDate?: IsoDate | null;
  expiryDate?: IsoDate | null;
  status: SecurityInstrumentStatus;
}

export type SecurityInstrumentEventType =
  | "ISSUED"
  | "EXTENDED"
  | "REFUND_REQUESTED"
  | "REFUNDED"
  | "ADJUSTED"
  | "FORFEITED"
  | "RELEASED";

export interface SecurityInstrumentEvent extends BaseEntity {
  securityInstrumentId: Id;
  type: SecurityInstrumentEventType;
  amount?: Money | null;
  date: IsoDate;
  reference?: string | null;
}

// ---- Bid & evaluation -----------------------------------------------------

export type TechnicalResult = "PENDING" | "QUALIFIED" | "REJECTED";

export interface Bid extends BaseEntity {
  tenderId: Id;
  quotedAmount: Money;
  /** Stored: negative = below estimate. */
  percentVsEstimate: Percent;
  submittedAt?: IsoDateTime | null;
  technicalResult: TechnicalResult;
  financialRank?: number | null;
  isL1: boolean;
  /** Revised bids are separate rows; one is final. */
  isFinal: boolean;
}

export interface BidClarification extends BaseEntity {
  bidId: Id;
  request: string;
  requestedOn: IsoDate;
  dueDate?: IsoDate | null;
  response?: string | null;
  respondedOn?: IsoDate | null;
}

export interface CompetitorBid extends BaseEntity {
  tenderId: Id;
  competitorName: string;
  amount: Money;
  rank?: number | null;
  isL1: boolean;
}

// ---- Award ----------------------------------------------------------------

export interface TenderAward extends BaseEntity {
  tenderId: Id;
  loaNo: string;
  loaDate: IsoDate;
  awardedAmount: Money;
  agreementNo?: string | null;
  agreementDate?: IsoDate | null;
  completionPeriodDays?: number | null;
  startDate?: IsoDate | null;
  conditionsNote?: string | null;
}

export type AwardConditionStatus = "PENDING" | "MET" | "WAIVED";

/** Gate for tender -> project conversion. */
export interface AwardCondition extends BaseEntity {
  awardId: Id;
  description: string;
  isMandatory: boolean;
  status: AwardConditionStatus;
  dueDate?: IsoDate | null;
}
