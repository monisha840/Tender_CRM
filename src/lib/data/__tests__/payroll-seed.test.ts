import { describe, expect, it } from "vitest";
import { buildSeedDatabase } from "@/lib/data/seed";
import { getEpfSummary, getPayrollStatusSummary } from "@/lib/data/workforce";
import { cmpMoney, sumMoney, toPaise } from "@/lib/money";

const db = buildSeedDatabase();
const run = (id: string) => db.payrollRuns.find((r) => r.id === id)!;
const period = (slip: { payrollRunId: string }) => run(slip.payrollRunId).periodMonth;
const profileOf = (employeeId: string) => db.employeeProfiles.find((x) => x.employeeId === employeeId)!;

describe("seeded payroll (B12-B14)", () => {
  it("net equals gross minus every deduction on every payslip", () => {
    for (const p of db.payslips) {
      const ded = sumMoney([p.epfEmployee, p.esiEmployee, p.advanceRecovered, p.otherDeductions]);
      expect(p.totalDeductions, p.id).toBe(ded);
      expect(toPaise(p.net), p.id).toBe(toPaise(p.gross) - toPaise(ded));
    }
  });
  it("PF wages exclude overtime and respect the ceiling in force", () => {
    for (const p of db.payslips.filter((x) => Number(x.epfWages) > 0)) {
      const ceiling = period(p) >= "2026-09" ? "25000.00" : "15000.00";
      expect(cmpMoney(p.epfWages, ceiling), p.id).toBeLessThanOrEqual(0);
      expect(toPaise(p.epfWages), p.id).toBeLessThanOrEqual(toPaise(p.gross) - toPaise(p.overtimeAmount));
    }
  });
  it("employer EPF share equals the employee share (EPF 3.67 + EPS 8.33 = 12)", () => {
    for (const p of db.payslips) expect(p.epfEmployer, p.id).toBe(p.epfEmployee);
  });
  it("days worked and overtime follow the attendance register where one exists", () => {
    const p = db.payslips.find((x) => x.id.startsWith("pslip_2026-09_emp_w_"))!;
    const rows = db.attendance.filter((a) => a.employeeId === p.employeeId && a.date.startsWith("2026-09"));
    expect(rows.length).toBeGreaterThan(20);
    expect(p.daysWorked).toBe(rows.reduce((t, a) => t + a.dayFraction, 0));
    expect(Number(p.overtimeAmount) > 0).toBe(rows.some((a) => a.status === "PRESENT" && a.overtimeMinutes > 0));
  });
  it("nobody is paid before joining or after exit", () => {
    for (const p of db.payslips) {
      const prof = profileOf(p.employeeId);
      const m = period(p);
      expect(`${m}-31` >= prof.joiningDate, p.id).toBe(true);
      if (prof.exitDate) expect(`${m}-01` <= prof.exitDate, p.id).toBe(true);
    }
  });
  it("advance recovery is an instalment, never random, and never exceeds what is outstanding", () => {
    const amounts = new Map<string, string[]>();
    for (const p of db.payslips.filter((x) => Number(x.advanceRecovered) > 0)) amounts.set(p.employeeId, [...(amounts.get(p.employeeId) ?? []), p.advanceRecovered]);
    expect(amounts.size).toBeGreaterThan(0);
    for (const list of amounts.values()) expect(new Set(list.slice(0, -1)).size).toBeLessThanOrEqual(1);
  });
  it("locked recoveries reduce the outstanding advance, which never goes negative", () => {
    const recovered = new Map<string, bigint>();
    for (const p of db.payslips.filter((x) => run(x.payrollRunId).status === "LOCKED")) recovered.set(p.employeeId, (recovered.get(p.employeeId) ?? BigInt(0)) + toPaise(p.advanceRecovered));
    expect([...recovered.values()].some((v) => v > BigInt(0))).toBe(true);
    for (const prof of db.employeeProfiles) expect(toPaise(prof.advanceBalance), prof.id).toBeGreaterThanOrEqual(BigInt(0));
    for (const p of db.payslips.filter((x) => period(x) === "2026-09")) expect(cmpMoney(p.advanceRecovered, profileOf(p.employeeId).advanceBalance), p.id).toBeLessThanOrEqual(0);
    expect(getPayrollStatusSummary(db, "2026-09").advanceOutstanding).toBe(sumMoney(db.employeeProfiles.map((x) => x.advanceBalance)));
  });
  it("EPF summary adds admin and EDLI on top of the 24% contribution", () => {
    const s = getEpfSummary(db, "2026-09");
    expect(s.payable).toBe(sumMoney([s.total, s.admin, s.edli]));
    expect(sumMoney([s.epf, s.eps])).toBe(s.employerShare);
    expect(Number(s.admin)).toBeGreaterThan(0);
  });
});
