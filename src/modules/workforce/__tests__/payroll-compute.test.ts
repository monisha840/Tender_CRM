import { describe, expect, it } from "vitest";
import { dayOfWeek, daysBetween } from "@/lib/dates";
import { daysInMonth } from "@/lib/payroll-rules";
import { computePayslip, employmentWindow, type DayRecord, type PayslipInput } from "@/modules/workforce/payroll";
import type { AttendanceStatus } from "@/types";

const base: PayslipInput = {
  period: "2026-08", region: "delhi", wageAmount: "20000.00", daily: false, joiningDate: "2020-01-01", exitDate: null,
  pfApplicable: true, esiApplicable: false, openingAdvance: "0.00", advanceOutstanding: "0.00", days: [],
};

/** Every day of the month: Sundays off, other days from `override` or present. */
function month(period: string, override: (date: string) => Partial<DayRecord> = () => ({})): DayRecord[] {
  return Array.from({ length: daysInMonth(period) }, (_, i) => {
    const date = `${period}-${String(i + 1).padStart(2, "0")}`;
    return { date, status: (dayOfWeek(date) === 0 ? "WEEKOFF" : "PRESENT") as AttendanceStatus, overtimeMinutes: 0, ...override(date) };
  });
}

describe("B14 payslip derived from attendance", () => {
  it("prorates monthly salary exactly in paise: 24/26 of 20,000 = 18,461.54", () => {
    const absent = new Set(["2026-08-03", "2026-08-04"]); // Monday, Tuesday
    const f = computePayslip({ ...base, days: month("2026-08", (d) => (absent.has(d) ? { status: "ABSENT" as AttendanceStatus } : {})) })!;
    expect(f.basePay).toBe("18461.54");
    expect(f.paidDays).toBe(24);
  });
  it("pays a full wage for a full register, whatever the month length", () => {
    for (const period of ["2026-02", "2026-08", "2026-10"]) {
      expect(computePayslip({ ...base, period, days: month(period) })!.basePay, period).toBe("20000.00");
    }
  });
  it("counts days worked and a half day as half", () => {
    const f = computePayslip({
      ...base, daily: true, wageAmount: "600.00",
      days: month("2026-08", (d) => (d === "2026-08-05" ? { status: "HALF_DAY" as AttendanceStatus } : d > "2026-08-10" ? { status: "ABSENT" as AttendanceStatus } : {})),
    })!;
    // 1-10 Aug: Sundays 2nd and 9th off, Aug 5 half => 7 full days + 0.5
    expect(f.daysWorked).toBe(7.5);
    expect(f.basePay).toBe("4500.00");
  });
  it("derives overtime from attendance minutes at twice the hourly rate", () => {
    const f = computePayslip({ ...base, daily: true, wageAmount: "800.00", days: month("2026-08", (d) => (d === "2026-08-03" ? { overtimeMinutes: 90 } : {})) })!;
    expect(f.overtimeAmount).toBe("300.00"); // 800/8 = 100 an hour, x2, 1.5 h
  });
  it("pays unregistered (office) staff the full month, less the days before a joiner started", () => {
    expect(computePayslip({ ...base, days: null })!.basePay).toBe("20000.00");
    const joiner = computePayslip({ ...base, days: null, joiningDate: "2026-08-17" })!;
    expect(joiner.paidDays).toBeLessThan(26);
    expect(Number(joiner.basePay)).toBeLessThan(20000);
  });
  it("produces no payslip before joining or after exit", () => {
    expect(computePayslip({ ...base, joiningDate: "2026-09-01", days: month("2026-08") })).toBeNull();
    expect(computePayslip({ ...base, exitDate: "2026-07-31", days: month("2026-08") })).toBeNull();
    expect(employmentWindow("2026-08", "2026-08-10", "2026-08-20")).toEqual({ from: "2026-08-10", to: "2026-08-20" });
    expect(daysBetween("2026-08-10", "2026-08-20")).toBe(10);
  });
  it("ignores attendance rows outside the employment dates", () => {
    const f = computePayslip({ ...base, daily: true, wageAmount: "500.00", joiningDate: "2026-08-20", days: month("2026-08") })!;
    expect(f.daysWorked).toBe(10); // 20-31 Aug minus Sundays 23rd and 30th
  });
});

describe("B13 deductions on the payslip", () => {
  it("PF wages are base pay without overtime, capped at the ceiling in force", () => {
    const f = computePayslip({ ...base, daily: true, wageAmount: "400.00", days: month("2026-08", () => ({ overtimeMinutes: 60 })) })!;
    expect(Number(f.overtimeAmount)).toBeGreaterThan(0);
    expect(f.epfWages).toBe(f.basePay); // below the ceiling and without overtime
    expect(Number(f.gross)).toBeGreaterThan(Number(f.epfWages));
    const high = computePayslip({ ...base, wageAmount: "40000.00", period: "2026-09", days: month("2026-09") })!;
    expect(high.epfWages).toBe("25000.00");
    expect(computePayslip({ ...base, wageAmount: "40000.00", days: month("2026-08") })!.epfWages).toBe("15000.00");
  });
  it("employer share is EPF + EPS and the extras are reported separately", () => {
    const f = computePayslip({ ...base, days: month("2026-08") })!;
    expect(f.epfEmployer).toBe(f.epfEmployee);
    expect(f.eps).toBe("1250.00");
    expect(f.epfAdmin).toBe("75.00");
    expect(f.edli).toBe("75.00");
  });
  it("ESI applies only when flagged, on gross including overtime", () => {
    const off = computePayslip({ ...base, wageAmount: "15000.00", days: month("2026-08") })!;
    expect(off.esiEmployee).toBe("0.00");
    const on = computePayslip({ ...base, wageAmount: "15000.00", esiApplicable: true, days: month("2026-08") })!;
    expect(on.esiEmployee).toBe("113.00");
    expect(on.esiEmployer).toBe("488.00");
  });
  it("net = gross - PF - ESI - professional tax - advance", () => {
    const f = computePayslip({ ...base, region: "mh", wageAmount: "15000.00", esiApplicable: true, openingAdvance: "5000.00", advanceOutstanding: "5000.00", days: month("2026-08") })!;
    expect(f.professionalTax).toBe("200.00");
    expect(f.advanceRecovered).toBe("500.00");
    const ded = 1800 + 113 + 200 + 500;
    expect(f.totalDeductions).toBe(`${ded}.00`);
    expect(f.net).toBe(`${15000 - ded}.00`);
  });
});

describe("B12 advance recovery", () => {
  it("recovers an instalment, then only what is left", () => {
    const first = computePayslip({ ...base, openingAdvance: "2000.00", advanceOutstanding: "2000.00", days: month("2026-08") })!;
    expect(first.advanceRecovered).toBe("500.00");
    const last = computePayslip({ ...base, openingAdvance: "2000.00", advanceOutstanding: "200.00", days: month("2026-08") })!;
    expect(last.advanceRecovered).toBe("200.00");
    expect(computePayslip({ ...base, days: month("2026-08") })!.advanceRecovered).toBe("0.00");
  });
});
