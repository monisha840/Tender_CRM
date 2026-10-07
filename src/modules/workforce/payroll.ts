import { dayOfWeek } from "@/lib/dates";
import { fromPaise, percentOf, toPaise } from "@/lib/money";
import {
  advanceRecovery,
  computeEsi,
  computePf,
  daysInMonth,
  OVERTIME_MULTIPLIER,
  PF_BASIC_DA_SHARE,
  professionalTax,
  SHIFT_MINUTES,
  STANDARD_MONTH_DAYS,
  type RegionCode,
} from "@/lib/payroll-rules";
import type { AttendanceStatus, IsoDate, Money } from "@/types";

/** One day of an employee's attendance register. */
export interface DayRecord {
  date: IsoDate;
  status: AttendanceStatus;
  overtimeMinutes: number;
}

export interface PayslipInput {
  period: string;
  region: RegionCode;
  wageAmount: Money;
  /** Daily-wage worker (paid per day worked) as opposed to monthly salary. */
  daily: boolean;
  joiningDate: IsoDate;
  exitDate: IsoDate | null;
  pfApplicable: boolean;
  esiApplicable: boolean;
  /** Advance at the start of the recovery schedule, and what is still outstanding before this month. */
  openingAdvance: Money;
  advanceOutstanding: Money;
  /** Attendance rows for the month. `null` = the employee is not on an attendance register (office staff): full pay for the days employed. */
  days: DayRecord[] | null;
}

export interface PayslipFigures {
  daysWorked: number;
  /** Days paid: worked days for daily wagers; for monthly staff the 26-day basis less unpaid days. */
  paidDays: number;
  basePay: Money;
  overtimeAmount: Money;
  gross: Money;
  epfWages: Money;
  epfEmployee: Money;
  /** EPF 3.67% + EPS 8.33% (the employer's 12%). */
  epfEmployer: Money;
  eps: Money;
  epfAdmin: Money;
  edli: Money;
  esiEmployee: Money;
  esiEmployer: Money;
  professionalTax: Money;
  advanceRecovered: Money;
  totalDeductions: Money;
  net: Money;
}

const BIG = BigInt;
const ZERO = BIG(0);

/** a / b rounded half up, on non-negative integers. */
const divRound = (a: bigint, b: bigint): bigint => (a * BIG(2) + b) / (b * BIG(2));
const sum = (...v: Money[]): Money => fromPaise(v.reduce((t, m) => t + toPaise(m), ZERO));

/** Attendance weights in half-days: [worked, paid-without-working]. */
const HALVES: Record<AttendanceStatus, [number, number]> = {
  PRESENT: [2, 0],
  HALF_DAY: [1, 0],
  ABSENT: [0, 0],
  LEAVE: [0, 0], // no leave ledger yet, so leave is treated as unpaid (open question)
  HOLIDAY: [0, 2],
  WEEKOFF: [0, 2], // a rotational off day on a non-Sunday
};

/** First and last day the employee is on the payroll for the month, or null when they are not employed in it. */
export function employmentWindow(period: string, joiningDate: IsoDate, exitDate: IsoDate | null): { from: IsoDate; to: IsoDate } | null {
  const start = `${period}-01`;
  const end = `${period}-${String(daysInMonth(period)).padStart(2, "0")}`;
  const from = joiningDate > start ? joiningDate : start;
  const to = exitDate && exitDate < end ? exitDate : end;
  return from > to ? null : { from, to };
}

/**
 * Builds the payslip numbers for one employee-month. Days and overtime come from the attendance register, money is
 * prorated in paise (never through a rounded percentage), and nothing is produced outside the employment dates.
 * Returns null when the employee joined after, or left before, the month.
 */
export function computePayslip(input: PayslipInput): PayslipFigures | null {
  const win = employmentWindow(input.period, input.joiningDate, input.exitDate);
  if (!win) return null;
  const monthEnd = `${input.period}-${String(daysInMonth(input.period)).padStart(2, "0")}`;
  const wage = toPaise(input.wageAmount);

  // Walk every day of the month. Days outside the employment window or without an attendance row earn nothing.
  const byDate = new Map((input.days ?? []).map((d) => [d.date, d]));
  const dim = daysInMonth(input.period);
  let workedHalves = 0;
  let overtimeMinutes = 0;
  let lostHalves = 0; // unpaid halves of the month's working days (Sundays are inside the 26-day basis, not counted)
  for (let n = 1; n <= dim; n++) {
    const date = `${input.period}-${String(n).padStart(2, "0")}`;
    const inWindow = date >= win.from && date <= win.to;
    const row = !inWindow ? undefined : input.days === null ? ({ date, status: "PRESENT", overtimeMinutes: 0 } as DayRecord) : byDate.get(date);
    const sunday = dayOfWeek(date) === 0;
    const [worked, paidOff] = row ? HALVES[row.status] : [0, 0];
    if (sunday && input.days === null) continue; // unregistered staff: Sundays are neither worked nor lost
    workedHalves += worked;
    if (row?.status === "PRESENT") overtimeMinutes += row.overtimeMinutes;
    if (!sunday) lostHalves += 2 - worked - paidOff;
  }

  // Monthly salary: full wage less the unpaid working days over the 26-day basis, in paise (24/26 of 20,000 = 18,461.54).
  const basisHalves = BIG(STANDARD_MONTH_DAYS * 2);
  const paidBasis = basisHalves - BIG(lostHalves);
  const basePay: bigint = input.daily ? divRound(wage * BIG(workedHalves), BIG(2)) : paidBasis <= ZERO ? ZERO : divRound(wage * (paidBasis > basisHalves ? basisHalves : paidBasis), basisHalves);
  const paidHalves = input.daily ? workedHalves : Number(paidBasis > basisHalves ? basisHalves : paidBasis);

  // Day rate: the daily wage itself, or monthly salary over 26 days. Overtime at 2x on an 8-hour day.
  const overtime =
    overtimeMinutes === 0
      ? ZERO
      : input.daily
        ? divRound(wage * BIG(OVERTIME_MULTIPLIER) * BIG(overtimeMinutes), BIG(SHIFT_MINUTES))
        : divRound(wage * BIG(OVERTIME_MULTIPLIER) * BIG(overtimeMinutes), BIG(STANDARD_MONTH_DAYS * SHIFT_MINUTES));

  const basePayM = fromPaise(basePay);
  const overtimeM = fromPaise(overtime);
  const gross = sum(basePayM, overtimeM);

  const pf = input.pfApplicable ? computePf(percentOf(basePayM, PF_BASIC_DA_SHARE * 100), monthEnd) : null;
  const dailyRate = input.daily ? input.wageAmount : fromPaise(divRound(wage, BIG(STANDARD_MONTH_DAYS)));
  const esi = input.esiApplicable ? computeEsi(gross, dailyRate, monthEnd) : { employee: "0.00", employer: "0.00" };
  const pt = professionalTax(input.region, gross, input.period);

  const statutory = sum(pf?.employee ?? "0.00", esi.employee, pt);
  const available = toPaise(gross) - toPaise(statutory);
  const advance = advanceRecovery(input.openingAdvance, input.advanceOutstanding, fromPaise(available > ZERO ? available : ZERO));
  const totalDeductions = sum(statutory, advance);

  return {
    daysWorked: workedHalves / 2,
    paidDays: paidHalves / 2,
    basePay: basePayM,
    overtimeAmount: overtimeM,
    gross,
    epfWages: pf?.wages ?? "0.00",
    epfEmployee: pf?.employee ?? "0.00",
    epfEmployer: pf?.employerShare ?? "0.00",
    eps: pf?.eps ?? "0.00",
    epfAdmin: pf?.admin ?? "0.00",
    edli: pf?.edli ?? "0.00",
    esiEmployee: esi.employee,
    esiEmployer: esi.employer,
    professionalTax: pt,
    advanceRecovered: advance,
    totalDeductions,
    net: fromPaise(toPaise(gross) - toPaise(totalDeductions)),
  };
}
