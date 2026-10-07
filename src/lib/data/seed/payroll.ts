import { addDays, dayOfWeek } from "@/lib/dates";
import { subMoney, sumMoney } from "@/lib/money";
import { daysInMonth, regionCodeOf } from "@/lib/payroll-rules";
import { computePayslip, type DayRecord } from "@/modules/workforce/payroll";
import type { AttendanceStatus, Money, PayrollRunStatus, SalaryPaymentStatus } from "@/types";
import { addApproval } from "./approvals";
import { at, dayOffset, meta, RegionKey, type RegionKeyName, type SeedCtx } from "./helpers";
import { userId } from "./org";

const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"] as const;
const REGIONS: RegionKeyName[] = ["cg", "mh", "south", "delhi"];
const REGION_LABEL: Record<RegionKeyName, string> = { cg: "Chhattisgarh", mh: "Maharashtra", south: "South", delhi: "Delhi" };
/** Region keys double as the professional-tax state codes in payroll-rules. */

/** FNV-1a hash to [0, 1): a stable stand-in for attendance the workforce seed does not cover. */
function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/**
 * The workforce seed only registers the last 90 days of attendance. For earlier days of a payroll month we derive the
 * day from a hash of employee and date, with the same mix as the seed (86% present, 4% half day, 6% absent, 4% leave,
 * Sundays off, overtime for daily workers only). Real rows always win; once the workforce seed covers April, this is unused.
 */
function historicalDay(employeeId: string, date: string, daily: boolean): DayRecord {
  if (dayOfWeek(date) === 0) return { date, status: "WEEKOFF", overtimeMinutes: 0 };
  const r = hash01(`${employeeId}|${date}`);
  const status: AttendanceStatus = r < 0.86 ? "PRESENT" : r < 0.9 ? "HALF_DAY" : r < 0.96 ? "ABSENT" : "LEAVE";
  const overtime = daily && status === "PRESENT" && hash01(`ot|${employeeId}|${date}`) < 0.2 ? [60, 90, 120, 180][Math.floor(hash01(`otlen|${employeeId}|${date}`) * 4)] : 0;
  return { date, status, overtimeMinutes: overtime };
}

function monthEnd(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function seedPayroll(ctx: SeedCtx) {
  const { db, rng } = ctx;

  // Attendance register per employee; the first registered date tells us where the real rows start.
  const register = new Map<string, Map<string, DayRecord>>();
  let firstRegistered = "9999-12-31";
  db.attendance.forEach((a) => {
    const rows = register.get(a.employeeId) ?? new Map<string, DayRecord>();
    rows.set(a.date, { date: a.date, status: a.status, overtimeMinutes: a.overtimeMinutes });
    register.set(a.employeeId, rows);
    if (a.date < firstRegistered) firstRegistered = a.date;
  });
  const daysFor = (employeeId: string, period: string, daily: boolean): DayRecord[] | null => {
    const rows = register.get(employeeId);
    if (!rows) return null; // not on an attendance register (office staff): paid for the full month
    const out: DayRecord[] = [];
    for (let n = 1; n <= daysInMonth(period); n++) {
      const date = `${period}-${String(n).padStart(2, "0")}`;
      const row = rows.get(date) ?? (date < firstRegistered ? historicalDay(employeeId, date, daily) : null);
      if (row) out.push(row);
    }
    return out;
  };

  // Advances are seeded as the balance at 1 April 2026; every locked run recovers an instalment and lowers it.
  const openingAdvance = new Map(db.employeeProfiles.map((p) => [p.employeeId, p.advanceBalance]));

  MONTHS.forEach((period) => {
    REGIONS.forEach((region) => {
      const regionId = RegionKey[region];
      const staff = db.employeeProfiles
        .map((p) => ({ p, e: db.employees.find((e) => e.id === p.employeeId)! }))
        .filter(({ p, e }) => e.homeRegionId === regionId && Number(p.wageAmount) > 0);
      const runId = `prun_${period}_${region}`;
      const locked = period !== "2026-09";
      const status: PayrollRunStatus = locked ? "LOCKED" : region === "cg" || region === "delhi" ? "APPROVED" : "PENDING_APPROVAL";
      const end = monthEnd(period);
      const slips: { gross: Money; epfE: Money; epfR: Money; net: Money }[] = [];
      const recoveries: { profileId: string; amount: Money }[] = [];

      staff.forEach(({ p, e }) => {
        const daily = db.labourTypes.find((l) => l.id === p.labourTypeId)?.payrollMode === "DAILY";
        const f = computePayslip({
          period, region: regionCodeOf(regionId), wageAmount: p.wageAmount, daily, joiningDate: p.joiningDate, exitDate: p.exitDate ?? null,
          pfApplicable: p.pfApplicable, esiApplicable: p.esiApplicable, openingAdvance: openingAdvance.get(e.id) ?? "0.00", advanceOutstanding: p.advanceBalance,
          days: daysFor(e.id, period, daily),
        });
        if (!f) return; // joined after, or left before, this month
        const paymentStatus: SalaryPaymentStatus = locked ? "PAID" : rng.chance(0.03) ? "ON_HOLD" : "PENDING";
        slips.push({ gross: f.gross, epfE: f.epfEmployee, epfR: f.epfEmployer, net: f.net });
        if (locked && f.advanceRecovered !== "0.00") recoveries.push({ profileId: p.id, amount: f.advanceRecovered });
        db.payslips.push({
          ...meta(`pslip_${period}_${e.id}`), payrollRunId: runId, employeeId: e.id, daysWorked: f.daysWorked, overtimeAmount: f.overtimeAmount, gross: f.gross,
          epfWages: f.epfWages, epfEmployee: f.epfEmployee, epfEmployer: f.epfEmployer, advanceRecovered: f.advanceRecovered, esiEmployee: f.esiEmployee,
          esiEmployer: f.esiEmployer, otherDeductions: f.professionalTax, totalDeductions: f.totalDeductions, net: f.net, paymentStatus,
          paidOn: paymentStatus === "PAID" ? addDays(end, 5) : null,
        });
      });
      // Only locked (paid) runs reduce the outstanding advance; an unlocked run shows what it will recover.
      recoveries.forEach(({ profileId, amount }) => {
        const profile = db.employeeProfiles.find((x) => x.id === profileId)!;
        profile.advanceBalance = subMoney(profile.advanceBalance, amount);
      });

      const netTotal = sumMoney(slips.map((s) => s.net));
      const approvalId = status === "PENDING_APPROVAL" ? `apr_${runId}` : null;
      db.payrollRuns.push({
        ...meta(runId, at(addDays(end, 1))), periodMonth: period, regionId, status, employeeCount: slips.length, grossTotal: sumMoney(slips.map((s) => s.gross)),
        epfEmployeeTotal: sumMoney(slips.map((s) => s.epfE)), epfEmployerTotal: sumMoney(slips.map((s) => s.epfR)), netTotal, lockedAt: locked ? at(addDays(end, 6)) : null,
        approvalRequestId: approvalId,
      });

      if (approvalId) {
        addApproval(ctx, {
          id: approvalId, entityType: "PAYROLL_RUN", entityId: runId, amount: netTotal, regionId, projectId: null, title: `Payroll ${period}, ${REGION_LABEL[region]}`,
          requestedById: userId("accounts"), approverId: userId("stalin"), status: "PENDING", submittedOn: dayOffset(-3),
        });
      }
      if (locked) {
        db.payments.push({
          ...meta(`pay_sal_${period}_${region}`), direction: "OUT", purpose: "SALARY", amount: netTotal, paidOn: addDays(end, 5), mode: "BANK_TRANSFER", utr: `UTR${rng.int(100000000, 999999999)}`,
          regionId, projectId: null, gstRegistrationId: null, remarks: `Salary ${period}`,
        });
      }
    });
  });
}
