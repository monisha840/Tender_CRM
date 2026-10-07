import { daysBetween } from "@/lib/dates";
import { fromPaise, percentOf, toPaise } from "@/lib/money";
import type { IsoDate, Money } from "@/types";

/**
 * Statutory payroll rates, kept in ONE place with effective dates.
 *
 * TEMPORARY BRIDGE: CLAUDE.md says business rules live in settings tables. Until Wave B's rules engine exists,
 * every rate below is read through the lookup helpers, never copied into callers, so moving this file to the
 * database later is a one-file change. Add a new dated entry when a rate changes; never edit an old one.
 */

type Dated<T> = { from: IsoDate; value: T; source: string };

/** The entry in force on `date` (latest `from` that is not after it). */
function inForce<T>(list: Dated<T>[], date: IsoDate): T {
  const hit = [...list].sort((a, b) => b.from.localeCompare(a.from)).find((e) => e.from <= date);
  return (hit ?? list[0]).value;
}

// ---- Provident fund --------------------------------------------------------------------------------------

/**
 * Monthly PF wage ceiling. ₹15,000 since 01-09-2014; ₹25,000 from 17-09-2026.
 * Source: Ministry of Labour & Employment notification S.O. 5109(E) dated 17-09-2026 under s.2(89) of the Code on
 * Social Security, 2020 (reported by Corporate Professionals / SGCMS, Sep 2026).
 * Open question: September 2026 is a split month; we apply the ceiling in force on the last day of the wage month.
 */
const PF_WAGE_CEILING: Dated<number>[] = [
  { from: "2014-09-01", value: 15000, source: "EPF Scheme para 2(f), wage limit raised from ₹6,500" },
  { from: "2026-09-17", value: 25000, source: "S.O. 5109(E), 17-09-2026" },
];

/**
 * Percent of PF wages. Employee 12%; employer 12% split into EPS 8.33% (capped at the wage ceiling) and EPF 3.67%.
 * Admin charge 0.50% (EPF Scheme para 32; the ₹500 per-establishment minimum is applied at challan level, not here)
 * and EDLI 0.50% (EDLI Scheme para 6A) are paid by the employer on top, never deducted from the employee.
 */
const PF_RATES: Dated<{ employee: number; eps: number; epf: number; admin: number; edli: number }>[] = [
  { from: "2014-09-01", value: { employee: 12, eps: 8.33, epf: 3.67, admin: 0.5, edli: 0.5 }, source: "EPF & MP Act 1952, EPS 1995, EDLI 1976" },
];

/**
 * The payslip has one wage field, so it is treated as basic + DA (the minimum-wage structure). PF wages are
 * therefore the earned base pay, never gross with overtime. Becomes a real basic/DA split in Wave B.
 */
export const PF_BASIC_DA_SHARE = 1;

export const pfWageCeiling = (date: IsoDate): Money => `${inForce(PF_WAGE_CEILING, date)}.00`;

const roundToRupee = (paise: bigint): bigint => ((paise + BigInt(50)) / BigInt(100)) * BigInt(100);
const ceilToRupee = (paise: bigint): bigint => ((paise + BigInt(99)) / BigInt(100)) * BigInt(100);
const rupeePercent = (amount: Money, percent: number): Money => fromPaise(roundToRupee(toPaise(percentOf(amount, percent))));

export interface PfFigures {
  /** Wages the contribution is charged on: min(PF wages, ceiling). */
  wages: Money;
  employee: Money;
  /** Employer EPF (A/c 01) = 3.67%, computed as employer 12% minus EPS so the two always add to the employee share. */
  epf: Money;
  /** Employer EPS pension (A/c 10) = 8.33% on wages capped at the ceiling. */
  eps: Money;
  /** epf + eps. */
  employerShare: Money;
  /** Admin charges (A/c 02), employer cost. */
  admin: Money;
  /** EDLI (A/c 21), employer cost. */
  edli: Money;
  /** employee + employer share + admin + EDLI: what the monthly challan has to cover. */
  payable: Money;
}

/** PF for one member. `pfWages` is basic + DA earned in the month; `asOf` picks the ceiling and rates by date. */
export function computePf(pfWages: Money, asOf: IsoDate): PfFigures {
  const ceiling = pfWageCeiling(asOf);
  const wages = toPaise(pfWages) > toPaise(ceiling) ? ceiling : pfWages;
  const rate = inForce(PF_RATES, asOf);
  const employee = rupeePercent(wages, rate.employee);
  const eps = rupeePercent(wages, rate.eps);
  const epf = fromPaise(toPaise(employee) - toPaise(eps));
  const admin = rupeePercent(wages, rate.admin);
  const edli = rupeePercent(wages, rate.edli);
  const employerShare = fromPaise(toPaise(epf) + toPaise(eps));
  return { wages, employee, epf, eps, employerShare, admin, edli, payable: fromPaise(toPaise(employee) + toPaise(employerShare) + toPaise(admin) + toPaise(edli)) };
}

// ---- ESI -------------------------------------------------------------------------------------------------

/**
 * ESI: covered when monthly wages (including overtime) are ₹21,000 or less; employee 0.75%, employer 3.25%.
 * Employees earning ₹176 a day or less pay no share (the employer still pays 3.25%).
 * Source: ESI Act 1948 s.2(9) and ESIC notification of 2019 (rates), ESIC wage ceiling circular. Contributions are
 * rounded up to the next rupee, as ESIC does. Persons with disability (₹25,000 ceiling) are not modelled.
 */
const ESI_RULES: Dated<{ ceiling: number; employee: number; employer: number; exemptDailyWage: number }>[] = [
  { from: "2019-07-01", value: { ceiling: 21000, employee: 0.75, employer: 3.25, exemptDailyWage: 176 }, source: "ESIC notification 2019" },
];

export const esiWageCeiling = (date: IsoDate): number => inForce(ESI_RULES, date).ceiling;

/** True when a monthly wage brings a NEW employee under ESI. Once covered, an employee stays covered for the contribution period. */
export const isEsiEligible = (monthlyWage: Money | number, asOf: IsoDate): boolean =>
  toPaise(monthlyWage) <= toPaise(esiWageCeiling(asOf));

export function computeEsi(gross: Money, dailyWage: Money | number, asOf: IsoDate): { employee: Money; employer: Money } {
  const r = inForce(ESI_RULES, asOf);
  const exempt = toPaise(dailyWage) <= toPaise(r.exemptDailyWage);
  return {
    employee: exempt ? "0.00" : fromPaise(ceilToRupee(toPaise(percentOf(gross, r.employee)))),
    employer: fromPaise(ceilToRupee(toPaise(percentOf(gross, r.employer)))),
  };
}

// ---- Professional tax ------------------------------------------------------------------------------------

export type RegionCode = "cg" | "mh" | "south" | "delhi";
export const regionCodeOf = (regionId: string): RegionCode => regionId.replace(/^reg_/, "") as RegionCode;

const rupees = (n: number): Money => `${n}.00`;

/**
 * Professional tax per employee, by state (the region stands for its state).
 *
 * Maharashtra, men's slabs (Maharashtra State Tax on Professions Act 1975): up to ₹7,500 nil; ₹7,501-10,000 ₹175;
 * above ₹10,000 ₹200, with ₹300 in February so the year totals ₹2,500. Women are exempt up to ₹25,000. The employee
 * record holds no gender, so the men's slabs apply (open question in docs/system-flow.md).
 * Chhattisgarh (Rajya Vritti Kar Adhiniyam 1995), slabs on ANNUAL salary: up to ₹1 L nil; to ₹1.5 L ₹130; to ₹2 L ₹150;
 * to ₹2.5 L ₹200; above ₹2.5 L ₹208 a month and ₹212 in March (₹2,500 a year cap).
 * Delhi has no professional tax.
 * Sources (checked Oct 2026): greythr.com/wiki/acts/professional-tax-chhattisgarh, calcguru.in Maharashtra and
 * Chhattisgarh FY 2026-27 pages, bankbazaar.com Maharashtra page.
 * South = Tamil Nadu (Chennai branch), half-yearly slabs on half-year salary, collected with the September and March
 * payroll: to ₹21,000 nil; ₹21,001-30,000 ₹135; ₹30,001-45,000 ₹315; ₹45,001-60,000 ₹690; ₹60,001-75,000 ₹1,025;
 * above ₹75,000 ₹1,250. NOT re-verified online; Karnataka sites (KPCL) use different rules (open question).
 */
export function professionalTax(region: RegionCode, monthlyGross: Money, period: string): Money {
  const gross = Number(toPaise(monthlyGross)) / 100;
  const month = Number(period.slice(5, 7));
  switch (region) {
    case "delhi":
      return rupees(0);
    case "mh":
      if (gross <= 7500) return rupees(0);
      if (gross <= 10000) return rupees(175);
      return rupees(month === 2 ? 300 : 200);
    case "cg": {
      const annual = gross * 12;
      if (annual <= 100000) return rupees(0);
      if (annual <= 150000) return rupees(130);
      if (annual <= 200000) return rupees(150);
      if (annual <= 250000) return rupees(200);
      return rupees(month === 3 ? 212 : 208);
    }
    case "south": {
      if (month !== 9 && month !== 3) return rupees(0);
      const half = gross * 6;
      if (half <= 21000) return rupees(0);
      if (half <= 30000) return rupees(135);
      if (half <= 45000) return rupees(315);
      if (half <= 60000) return rupees(690);
      if (half <= 75000) return rupees(1025);
      return rupees(1250);
    }
  }
}

// ---- Wages, overtime, advances ---------------------------------------------------------------------------

/** Monthly salary is divided over 26 working days to get a day rate (also used to compare daily and monthly staff). */
export const STANDARD_MONTH_DAYS = 26;
/** Overtime is paid at twice the ordinary hourly rate (Factories Act 1948 s.59) on an 8-hour day. */
export const OVERTIME_MULTIPLIER = 2;
export const SHIFT_MINUTES = 8 * 60;

/** Advance recovery: 10% of the advance a month (at least ₹500), rounded up to ₹100, never more than half of the pay. */
const ADVANCE = { ratePercent: 10, min: 500, roundTo: 100, maxShareOfPay: 50 };

export function advanceInstallment(opening: Money): Money {
  const raw = Math.max(ADVANCE.min, Number(toPaise(percentOf(opening, ADVANCE.ratePercent))) / 100);
  return rupees(Math.ceil(raw / ADVANCE.roundTo) * ADVANCE.roundTo);
}

/** Amount recovered this month: the instalment, limited by what is still outstanding and by half of the pay available. */
export function advanceRecovery(opening: Money, outstanding: Money, payBeforeAdvance: Money): Money {
  const caps = [toPaise(advanceInstallment(opening)), toPaise(outstanding), toPaise(percentOf(payBeforeAdvance, ADVANCE.maxShareOfPay))];
  const least = caps.reduce((a, b) => (a < b ? a : b));
  return fromPaise(least < BigInt(0) ? BigInt(0) : least);
}

/** Days in a "YYYY-MM" month. */
export const daysInMonth = (period: string): number => {
  const [y, m] = period.split("-").map(Number);
  return daysBetween(`${period}-01`, `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`);
};
