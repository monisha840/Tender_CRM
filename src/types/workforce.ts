import type { BaseEntity, Id, IsoDate, IsoDateTime, Money } from "./common";

export type PayrollMode = "MONTHLY" | "DAILY" | "CONTRACTOR";

/** Configurable. `payrollMode` decides whether the person is on payroll or paid via a contractor bill. */
export interface LabourType extends BaseEntity {
  name: string;
  payrollMode: PayrollMode;
  isActive: boolean;
}

/** Workforce profile layered over the base `Employee` identity in org.ts. */
export interface EmployeeProfile extends BaseEntity {
  employeeId: Id;
  designation: string;
  labourTypeId: Id;
  joiningDate: IsoDate;
  exitDate?: IsoDate | null;
  /** Monthly gross for MONTHLY staff; daily rate for DAILY workers. */
  wageAmount: Money;
  uan?: string | null;
  contractorId?: Id | null;
}

/** Assignment history is the transfer log: a transfer closes one row and opens another. */
export interface SiteAssignment extends BaseEntity {
  employeeId: Id;
  siteId: Id;
  projectId: Id;
  role: string;
  fromDate: IsoDate;
  toDate?: IsoDate | null;
  reason?: string | null;
  assignedById: Id;
}

export type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY" | "LEAVE" | "HOLIDAY" | "WEEKOFF";
export type AttendanceSource = "SUPERVISOR" | "SELF" | "BIOMETRIC" | "IMPORT";

export interface Attendance extends BaseEntity {
  employeeId: Id;
  siteId: Id;
  projectId: Id;
  regionId: Id;
  date: IsoDate;
  status: AttendanceStatus;
  /** 1 for a full day, 0.5 for a half day, 0 otherwise. */
  dayFraction: number;
  overtimeMinutes: number;
  source: AttendanceSource;
  markedById: Id;
  /** Client-generated id so offline retries are idempotent. */
  clientUuid: string;
}

export type PayrollRunStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PAID" | "LOCKED";

export interface PayrollRun extends BaseEntity {
  /** "YYYY-MM" */
  periodMonth: string;
  regionId: Id;
  status: PayrollRunStatus;
  employeeCount: number;
  grossTotal: Money;
  epfEmployeeTotal: Money;
  epfEmployerTotal: Money;
  netTotal: Money;
  lockedAt?: IsoDateTime | null;
  approvalRequestId?: Id | null;
}

export interface Payslip extends BaseEntity {
  payrollRunId: Id;
  employeeId: Id;
  daysWorked: number;
  overtimeAmount: Money;
  gross: Money;
  /** EPF figures are snapshotted on the payslip. */
  epfWages: Money;
  epfEmployee: Money;
  epfEmployer: Money;
  otherDeductions: Money;
  net: Money;
}
