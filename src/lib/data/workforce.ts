import { getToday } from "@/lib/dates";
import { moneyToNumber, sumMoney } from "@/lib/money";
import { computePf, daysInMonth } from "@/lib/payroll-rules";
import type { Attendance, Database, Employee, EmployeeProfile, Id, IsoDate, PayrollRun, Payslip, SiteAssignment } from "@/types";
import { byId, inRegion, regionName, sum, type RegionFilter } from "./shared";

export interface EmployeeRow {
  employee: Employee;
  profile: EmployeeProfile | null;
  regionName: string;
  labourType: string;
  /** Current site assignments (open-ended or ending today or later). */
  assignments: (SiteAssignment & { siteName: string })[];
}

export function listEmployees(db: Database, region: RegionFilter = "ALL", search?: string): EmployeeRow[] {
  const today = getToday();
  const q = search?.trim().toLowerCase();
  return db.employees
    .filter((e) => !e.deletedAt && inRegion(region, e.homeRegionId))
    .filter((e) => !q || e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q))
    .map((employee): EmployeeRow => {
      const profile = db.employeeProfiles.find((p) => p.employeeId === employee.id) ?? null;
      return {
        employee,
        profile,
        regionName: regionName(db, employee.homeRegionId),
        labourType: byId(db.labourTypes, profile?.labourTypeId)?.name ?? "—",
        assignments: db.siteAssignments
          .filter((a) => a.employeeId === employee.id && (!a.toDate || a.toDate >= today))
          .map((a) => ({ ...a, siteName: byId(db.sites, a.siteId)?.name ?? "—" })),
      };
    });
}

export interface AttendanceSummary {
  date: IsoDate;
  present: number;
  halfDay: number;
  absent: number;
  onLeave: number;
  /** Assigned employees with no attendance row for the date (excluding week-offs). */
  notMarked: number;
  overtimeHours: number;
}

export function getAttendanceSummary(db: Database, date: IsoDate = getToday(), region: RegionFilter = "ALL"): AttendanceSummary {
  const rows = db.attendance.filter((a) => a.date === date && inRegion(region, a.regionId));
  const count = (s: Attendance["status"]) => rows.filter((a) => a.status === s).length;
  const assigned = db.siteAssignments.filter(
    (a) => a.fromDate <= date && (!a.toDate || a.toDate >= date) && inRegion(region, byId(db.sites, a.siteId)?.regionId),
  );
  const marked = new Set(rows.map((a) => a.employeeId));
  const weekOff = rows.length > 0 && rows.every((a) => a.status === "WEEKOFF");
  return {
    date,
    present: count("PRESENT"),
    halfDay: count("HALF_DAY"),
    absent: count("ABSENT"),
    onLeave: count("LEAVE"),
    notMarked: weekOff ? 0 : assigned.filter((a) => !marked.has(a.employeeId)).length,
    overtimeHours: sum(rows.map((a) => a.overtimeMinutes)) / 60,
  };
}

export function listPayrollRuns(db: Database, region: RegionFilter = "ALL"): PayrollRun[] {
  return db.payrollRuns
    .filter((r) => inRegion(region, r.regionId))
    .sort((a, b) => b.periodMonth.localeCompare(a.periodMonth) || a.regionId.localeCompare(b.regionId));
}

export function getPayslips(db: Database, runId: Id) {
  return db.payslips
    .filter((p) => p.payrollRunId === runId)
    .map((payslip) => ({ payslip, employee: byId(db.employees, payslip.employeeId)! }));
}

/**
 * EPF totals for a month ("YYYY-MM"), ready for the EPFO export screen. `employerShare` is the employer's 12%
 * (EPF 3.67% + EPS 8.33%); `admin` and `edli` are employer charges on top; `payable` is the whole monthly challan.
 * `total` stays employee + employer share for existing callers.
 */
export function getEpfSummary(db: Database, period: string, region: RegionFilter = "ALL") {
  const runs = db.payrollRuns.filter((r) => r.periodMonth === period && inRegion(region, r.regionId));
  const slips = db.payslips.filter((p) => runs.some((r) => r.id === p.payrollRunId));
  const asOf = `${period}-${String(daysInMonth(period)).padStart(2, "0")}`;
  const parts = slips.filter((p) => Number(p.epfWages) > 0).map((p) => computePf(p.epfWages, asOf));
  return {
    period,
    members: parts.length,
    wages: sumMoney(slips.map((p) => p.epfWages)),
    employeeShare: sumMoney(slips.map((p) => p.epfEmployee)),
    employerShare: sumMoney(slips.map((p) => p.epfEmployer)),
    epf: sumMoney(parts.map((x) => x.epf)),
    eps: sumMoney(parts.map((x) => x.eps)),
    admin: sumMoney(parts.map((x) => x.admin)),
    edli: sumMoney(parts.map((x) => x.edli)),
    payable: sumMoney([...slips.flatMap((p) => [p.epfEmployee, p.epfEmployer]), ...parts.flatMap((x) => [x.admin, x.edli])]),
    total: sumMoney(slips.flatMap((p) => [p.epfEmployee, p.epfEmployer])),
    totalNumber: moneyToNumber(sumMoney(slips.flatMap((p) => [p.epfEmployee, p.epfEmployer]))),
  };
}

/** Months that have payroll data, newest first. */
export const listPayrollPeriods = (db: Database): string[] =>
  [...new Set(db.payrollRuns.map((r) => r.periodMonth))].sort().reverse();

export interface EmployeePayRow {
  employee: Employee;
  profile: EmployeeProfile;
  designation: string;
  regionName: string;
  /** Payslip for the period, or null when the employee is not on payroll (e.g. directors). */
  payslip: Payslip | null;
}

/**
 * Salary, advance, deductions, PF, ESI, net salary and payment status per employee for a month ("YYYY-MM").
 * Advance outstanding is on the profile; the recovered amount, deductions and net are on the payslip.
 */
export function listEmployeePay(db: Database, period: string, region: RegionFilter = "ALL", search?: string): EmployeePayRow[] {
  const q = search?.trim().toLowerCase();
  const runIds = new Set(db.payrollRuns.filter((r) => r.periodMonth === period).map((r) => r.id));
  const slips = new Map(db.payslips.filter((p) => runIds.has(p.payrollRunId)).map((p) => [p.employeeId, p]));
  return db.employeeProfiles
    .map((profile) => ({ profile, employee: byId(db.employees, profile.employeeId)! }))
    .filter(({ employee }) => employee && !employee.deletedAt && inRegion(region, employee.homeRegionId))
    .filter(({ employee }) => !q || employee.name.toLowerCase().includes(q) || employee.code.toLowerCase().includes(q))
    .map(({ profile, employee }) => ({
      employee,
      profile,
      designation: profile.designation,
      regionName: regionName(db, employee.homeRegionId),
      payslip: slips.get(employee.id) ?? null,
    }))
    .sort((a, b) => a.employee.code.localeCompare(b.employee.code));
}

/** Payroll totals for a month: how much is paid, pending or on hold. */
export function getPayrollStatusSummary(db: Database, period: string, region: RegionFilter = "ALL") {
  const rows = listEmployeePay(db, period, region).filter((r) => r.payslip);
  const total = (status: Payslip["paymentStatus"]) => sumMoney(rows.filter((r) => r.payslip!.paymentStatus === status).map((r) => r.payslip!.net));
  return { employees: rows.length, paid: total("PAID"), pending: total("PENDING"), onHold: total("ON_HOLD"), advanceOutstanding: sumMoney(rows.map((r) => r.profile.advanceBalance)) };
}
