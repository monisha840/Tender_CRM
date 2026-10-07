import { describe, expect, it } from "vitest";
import { buildSeedDatabase } from "@/lib/data/seed";
import { buildEmployee, parseMoneyInput } from "@/modules/workforce/entry";

describe("B15 money parsing in the employee builder", () => {
  it("accepts plain rupee amounts", () => {
    expect(parseMoneyInput("₹12,500")).toBe("12500.00");
    expect(parseMoneyInput("600.5")).toBe("600.50");
    expect(parseMoneyInput("007")).toBe("7.00");
    expect(parseMoneyInput("")).toBe("0.00");
  });
  it("rejects exponents, hex, signs, words and extra decimals", () => {
    for (const bad of ["1e3", "0x10", "-5", "+5", "1.234", "abc", "Infinity", "NaN", "1_000", "1 2e1"]) {
      expect(parseMoneyInput(bad), bad).toBeNull();
    }
  });
});

describe("B15 new employees are flagged for ESI from the wage ceiling", () => {
  const db = buildSeedDatabase();
  const entry = { name: "Test Worker", region: "Delhi", designation: "Helper", labourType: "Monthly staff", joiningDate: "01-10-2026" };
  const esi = (e: Record<string, string>) => {
    const r = buildEmployee(db, { ...entry, ...e }, { userId: "u1" });
    if ("error" in r) throw new Error(r.error);
    return r.rows.profile.esiApplicable;
  };
  it("flags monthly wages up to ₹21,000 and not above", () => {
    expect(esi({ wage: "21000" })).toBe(true);
    expect(esi({ wage: "21001" })).toBe(false);
  });
  it("compares daily wages as a 26-day month", () => {
    expect(esi({ labourType: "Daily-wage worker", wage: "800" })).toBe(true); // 20,800
    expect(esi({ labourType: "Daily-wage worker", wage: "820" })).toBe(false); // 21,320
  });
  it("an explicit yes/no still wins, and 'auto' means automatic", () => {
    expect(esi({ wage: "15000", esi: "no" })).toBe(false);
    expect(esi({ wage: "30000", esi: "yes" })).toBe(true);
    expect(esi({ wage: "15000", esi: "auto" })).toBe(true);
  });
  it("rejects a wage or advance typed as 1e3 or 0x10", () => {
    expect(buildEmployee(db, { ...entry, wage: "1e3" }, { userId: "u1" })).toHaveProperty("error");
    expect(buildEmployee(db, { ...entry, wage: "0x10" }, { userId: "u1" })).toHaveProperty("error");
    expect(buildEmployee(db, { ...entry, wage: "15000", advance: "1e2" }, { userId: "u1" })).toHaveProperty("error");
  });
});
