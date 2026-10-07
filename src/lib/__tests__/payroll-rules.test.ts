import { describe, expect, it } from "vitest";
import {
  advanceInstallment,
  advanceRecovery,
  computeEsi,
  computePf,
  isEsiEligible,
  pfWageCeiling,
  professionalTax,
} from "@/lib/payroll-rules";

describe("PF wage ceiling by date (B13)", () => {
  it("is ₹15,000 before 17-09-2026 and ₹25,000 from that date", () => {
    expect(pfWageCeiling("2026-04-30")).toBe("15000.00");
    expect(pfWageCeiling("2026-09-16")).toBe("15000.00");
    expect(pfWageCeiling("2026-09-17")).toBe("25000.00");
    expect(pfWageCeiling("2027-01-01")).toBe("25000.00");
  });
});

describe("PF split (B13)", () => {
  it("caps wages at the ceiling and splits employer 12% into EPF 3.67% + EPS 8.33%", () => {
    const pf = computePf("20000.00", "2026-08-31");
    expect(pf.wages).toBe("15000.00");
    expect(pf.employee).toBe("1800.00");
    expect(pf.eps).toBe("1250.00"); // 8.33% of 15,000 = 1,249.50, rounded to the rupee
    expect(pf.epf).toBe("550.00"); // 12% - EPS, so EPF + EPS always equals the employee share
    expect(pf.employerShare).toBe("1800.00");
    expect(pf.admin).toBe("75.00");
    expect(pf.edli).toBe("75.00");
    expect(pf.payable).toBe("3750.00");
  });
  it("uses the new ceiling from 17-09-2026", () => {
    const pf = computePf("20000.00", "2026-09-30");
    expect(pf.wages).toBe("20000.00");
    expect(pf.employee).toBe("2400.00");
    expect(pf.eps).toBe("1666.00");
    expect(pf.epf).toBe("734.00");
    expect(computePf("40000.00", "2026-09-30").wages).toBe("25000.00");
  });
  it("charges nothing on zero wages", () => {
    expect(computePf("0.00", "2026-08-31").payable).toBe("0.00");
  });
});

describe("ESI (B13)", () => {
  it("covers monthly wages up to ₹21,000", () => {
    expect(isEsiEligible("21000.00", "2026-08-31")).toBe(true);
    expect(isEsiEligible("21000.01", "2026-08-31")).toBe(false);
  });
  it("rounds contributions up to the next rupee", () => {
    const esi = computeEsi("15000.00", "600.00", "2026-08-31");
    expect(esi.employee).toBe("113.00"); // 112.50
    expect(esi.employer).toBe("488.00"); // 487.50
  });
  it("exempts the employee share at ₹176 a day or less", () => {
    expect(computeEsi("4000.00", "176.00", "2026-08-31").employee).toBe("0.00");
    expect(computeEsi("4000.00", "176.00", "2026-08-31").employer).toBe("130.00");
  });
});

describe("professional tax by state (B13)", () => {
  it("Delhi has none", () => expect(professionalTax("delhi", "90000.00", "2026-08")).toBe("0.00"));
  it("Maharashtra: nil to 7,500, 175 to 10,000, 200 above, 300 in February", () => {
    expect(professionalTax("mh", "7500.00", "2026-08")).toBe("0.00");
    expect(professionalTax("mh", "9000.00", "2026-08")).toBe("175.00");
    expect(professionalTax("mh", "15000.00", "2026-08")).toBe("200.00");
    expect(professionalTax("mh", "15000.00", "2027-02")).toBe("300.00");
  });
  it("Chhattisgarh: annual slabs, 208 a month and 212 in March", () => {
    expect(professionalTax("cg", "8000.00", "2026-08")).toBe("0.00"); // 96,000 a year
    expect(professionalTax("cg", "11000.00", "2026-08")).toBe("130.00");
    expect(professionalTax("cg", "14000.00", "2026-08")).toBe("150.00");
    expect(professionalTax("cg", "20000.00", "2026-08")).toBe("200.00"); // 2.4 L a year
    expect(professionalTax("cg", "30000.00", "2026-08")).toBe("208.00");
    expect(professionalTax("cg", "30000.00", "2027-03")).toBe("212.00");
  });
  it("South (Tamil Nadu) is collected half-yearly in September and March only", () => {
    expect(professionalTax("south", "30000.00", "2026-08")).toBe("0.00");
    expect(professionalTax("south", "30000.00", "2026-09")).toBe("1250.00"); // 1.8 L a half year
    expect(professionalTax("south", "9000.00", "2026-09")).toBe("690.00"); // 54,000
    expect(professionalTax("south", "3000.00", "2026-09")).toBe("0.00");
  });
});

describe("advance recovery (B12)", () => {
  it("instalment is 10% of the advance, at least ₹500, rounded up to ₹100", () => {
    expect(advanceInstallment("2000.00")).toBe("500.00");
    expect(advanceInstallment("8000.00")).toBe("800.00");
    expect(advanceInstallment("10000.00")).toBe("1000.00");
    expect(advanceInstallment("12345.00")).toBe("1300.00");
  });
  it("never recovers more than is outstanding or half of the pay", () => {
    expect(advanceRecovery("10000.00", "300.00", "15000.00")).toBe("300.00");
    expect(advanceRecovery("10000.00", "9000.00", "1200.00")).toBe("600.00");
    expect(advanceRecovery("10000.00", "0.00", "15000.00")).toBe("0.00");
  });
});
