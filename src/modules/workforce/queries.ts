import { lastNMonths } from "@/lib/dates";
import { moneyToNumber } from "@/lib/money";
import type { Attendance, Database, Id, IsoDate, Payslip, SalaryPaymentStatus } from "@/types";
import { byId, inRegion, listEmployeePay, listEmployees, listPayrollPeriods, getPayrollStatusSummary, getEpfSummary, type RegionFilter } from "@/lib/data";

export type PayFilter = SalaryPaymentStatus | "NOT_ON_PAYROLL";

export interface DirectoryRow {
  id: Id;
  code: string;
  name: string;
  phone: string;
  siteIds: Id[];
  siteNames: string;
  designation: string;
  department: string;
  labourType: string;
  regionName: string;
  joiningDate: string;
  wage: string;
  /** Daily-rate workers have a per-day wage, everyone else a monthly salary. */
  wageUnit: "month" | "day";
  advance: string;
  payStatus: PayFilter;
}

/** Employee master rows joined with site, labour type and the latest month's payment status. */
export function getDirectory(db: Database, region: RegionFilter): DirectoryRow[] {
  const period = listPayrollPeriods(db)[0];
  const pay = new Map(listEmployeePay(db, period ?? "", region).map((r) => [r.employee.id, r.payslip]));
  const labour = new Map(db.labourTypes.map((l) => [l.id, l]));
  return listEmployees(db, region)
    .filter((r) => r.profile)
    .map((r): DirectoryRow => {
      const p = r.profile!;
      return {
        id: r.employee.id,
        code: r.employee.code,
        name: r.employee.name,
        phone: r.employee.phone ?? "—",
        siteIds: r.assignments.map((a) => a.siteId),
        siteNames: r.assignments.map((a) => a.siteName).join(", ") || "Office / unassigned",
        designation: p.designation,
        department: p.department,
        labourType: r.labourType,
        regionName: r.regionName,
        joiningDate: p.joiningDate,
        wage: p.wageAmount,
        wageUnit: labour.get(p.labourTypeId)?.payrollMode === "DAILY" ? "day" : "month",
        advance: p.advanceBalance,
        payStatus: pay.get(r.employee.id)?.paymentStatus ?? "NOT_ON_PAYROLL",
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

export interface GridRow {
  id: Id;
  code: string;
  name: string;
  designation: string;
  byDate: Record<IsoDate, Attendance>;
  /** Days counted for pay (full day = 1, half day = 0.5). */
  daysWorked: number;
  absent: number;
  leave: number;
  halfDays: number;
  overtimeHours: number;
}

/** Everyone with attendance at the site in a month ("YYYY-MM"), with per-day status and totals. */
export function getAttendanceGrid(db: Database, siteId: Id, month: string): GridRow[] {
  const rows = new Map<Id, GridRow>();
  for (const a of db.attendance) {
    if (a.siteId !== siteId || !a.date.startsWith(month)) continue;
    let row = rows.get(a.employeeId);
    if (!row) {
      const e = byId(db.employees, a.employeeId);
      row = {
        id: a.employeeId, code: e?.code ?? "", name: e?.name ?? "—",
        designation: db.employeeProfiles.find((p) => p.employeeId === a.employeeId)?.designation ?? "—",
        byDate: {}, daysWorked: 0, absent: 0, leave: 0, halfDays: 0, overtimeHours: 0,
      };
      rows.set(a.employeeId, row);
    }
    row.byDate[a.date] = a;
    row.daysWorked += a.dayFraction;
    row.overtimeHours += a.overtimeMinutes / 60;
    if (a.status === "ABSENT") row.absent += 1;
    if (a.status === "LEAVE") row.leave += 1;
    if (a.status === "HALF_DAY") row.halfDays += 1;
  }
  return [...rows.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** Months that have any attendance, newest first. */
export const attendanceMonths = (): string[] => lastNMonths(4).reverse();

/** Sites that have staff assigned, in region. */
export function getStaffedSites(db: Database, region: RegionFilter) {
  const ids = new Set(db.siteAssignments.filter((a) => !a.toDate).map((a) => a.siteId));
  return db.sites.filter((s) => !s.deletedAt && ids.has(s.id) && inRegion(region, s.regionId)).sort((a, b) => a.name.localeCompare(b.name));
}

export interface TrendPoint {
  period: string;
  paid: number;
  pending: number;
  onHold: number;
  employees: number;
  pf: number;
}

/** Net salary by payment status and PF total for the last `count` payroll months, oldest first. */
export function getPayrollTrend(db: Database, region: RegionFilter, count = 6): TrendPoint[] {
  return listPayrollPeriods(db)
    .slice(0, count)
    .reverse()
    .map((period) => {
      const s = getPayrollStatusSummary(db, period, region);
      return {
        period,
        paid: moneyToNumber(s.paid),
        pending: moneyToNumber(s.pending),
        onHold: moneyToNumber(s.onHold),
        employees: s.employees,
        pf: getEpfSummary(db, period, region).totalNumber,
      };
    });
}

export type { Payslip };
