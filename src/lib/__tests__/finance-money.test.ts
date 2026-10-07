/**
 * Wave A, finance agent: money helpers and GSTIN/PAN validation.
 * Covers B17 (GSTIN checksum, state code, PAN), B18 (CGST = SGST), B19 (malformed input, compact rounding) and the money half of B20.
 */
import { describe, expect, it } from "vitest";
import {
  formatINR,
  formatINRAxis,
  fromPaise,
  halfOf,
  hasOutstanding,
  moneyToNumber,
  outstandingMoney,
  splitGst,
  splitTaxAmount,
  sumMoney,
  toEvenPaise,
  toPaise,
  tryToPaise,
} from "@/lib/money";
import { gstinCheckChar, gstinError, gstinPan, gstinStateCode, isValidGstin, isValidGstStateCode, isValidPan, makeGstin, withValidCheckChar } from "@/lib/gst-validation";

describe("B19: toPaise and formatINR never throw on bad input", () => {
  const bad = ["abc", "1e5", "0x10", "", "  ", ".", "-", "1.2.3", "₹100", "12,345", "NaN", "Infinity"];

  it("tryToPaise returns null for anything that is not a plain decimal", () => {
    for (const v of bad) expect(tryToPaise(v), JSON.stringify(v)).toBeNull();
    expect(tryToPaise(NaN)).toBeNull();
    expect(tryToPaise(Infinity)).toBeNull();
    expect(tryToPaise(-Infinity)).toBeNull();
    expect(tryToPaise(null)).toBeNull();
    expect(tryToPaise(undefined)).toBeNull();
  });
  it("toPaise treats malformed input as zero instead of throwing", () => {
    for (const v of bad) expect(() => toPaise(v), JSON.stringify(v)).not.toThrow();
    expect(toPaise("abc")).toBe(BigInt(0));
    expect(toPaise(NaN)).toBe(BigInt(0));
    expect(fromPaise(toPaise("1e5"))).toBe("0.00");
  });
  it("formatINR renders a dash for malformed input", () => {
    for (const v of bad.filter((x) => x.trim() !== "")) expect(formatINR(v), JSON.stringify(v)).toBe("—");
    expect(formatINR(NaN)).toBe("—");
    expect(formatINR(Infinity, { compact: true })).toBe("—");
    expect(formatINR("abc", { compact: "auto" })).toBe("—");
  });
  it("moneyToNumber and formatINRAxis are safe too", () => {
    expect(moneyToNumber("abc")).toBe(0);
    expect(formatINRAxis(NaN)).toBe("—");
  });
  it("parses the valid forms as before", () => {
    expect(tryToPaise("1234.5")).toBe(BigInt(123450));
    expect(tryToPaise("-12.30")).toBe(BigInt(-1230));
    expect(tryToPaise("+7")).toBe(BigInt(700));
    expect(tryToPaise(".5")).toBe(BigInt(50));
    expect(tryToPaise(1234.5)).toBe(BigInt(123450));
    expect(tryToPaise(BigInt(9))).toBe(BigInt(9));
  });
  it("rounds a third decimal half away from zero instead of truncating", () => {
    expect(fromPaise(toPaise("0.005"))).toBe("0.01");
    expect(fromPaise(toPaise("0.004"))).toBe("0.00");
    expect(fromPaise(toPaise("-0.005"))).toBe("-0.01");
    expect(fromPaise(toPaise("9.999"))).toBe("10.00");
  });
});

describe("B19: compact format rounds first, then picks the unit", () => {
  it("₹99,99,999.99 is ₹1.00 Cr, not ₹100.00 L", () => {
    expect(formatINR("9999999.99", { compact: true })).toBe("₹1.00 Cr");
    expect(formatINR("9999999.99", { compact: "auto" })).toBe("₹1.00 Cr");
    expect(formatINR("-9999999.99", { compact: true })).toBe("-₹1.00 Cr");
  });
  it("stays in lakh while the rounded figure is below 100.00 L", () => {
    expect(formatINR("9949999.00", { compact: true })).toBe("₹99.50 L");
    expect(formatINR("9994999.99", { compact: true })).toBe("₹99.95 L");
    expect(formatINR("9995000.00", { compact: true })).toBe("₹99.95 L");
    expect(formatINR("9999500.00", { compact: true })).toBe("₹1.00 Cr");
  });
  it("keeps the ordinary cases", () => {
    expect(formatINR("100000.00", { compact: true })).toBe("₹1.00 L");
    expect(formatINR("24000000.00", { compact: true })).toBe("₹2.40 Cr");
    expect(formatINR("2400000000.00", { compact: true })).toBe("₹240.00 Cr");
    expect(formatINR("99999.99", { compact: "auto" })).toBe("₹99,999.99");
  });
  it("does not lose precision on very large amounts", () => {
    expect(formatINR("123456789012.34", { compact: true })).toBe("₹12345.68 Cr");
  });
});

describe("B18: CGST equals SGST exactly", () => {
  it("rounds an odd-paisa total tax to an even number of paise and halves it", () => {
    expect(toEvenPaise("18.05")).toBe("18.06");
    expect(toEvenPaise("18.04")).toBe("18.04");
    expect(toEvenPaise("-18.05")).toBe("-18.06");
    expect(halfOf("18.06")).toBe("9.03");
  });
  it("splitGst intra-state: CGST === SGST and tax = CGST + SGST for many amounts", () => {
    for (let paise = 1; paise <= 4000; paise += 7) {
      const taxable = fromPaise(BigInt(paise * 13 + 1));
      for (const rate of [5, 12, 18, 28]) {
        const s = splitGst(taxable, rate, true);
        expect(s.cgst, `${taxable} @ ${rate}`).toBe(s.sgst);
        expect(sumMoney([s.cgst, s.sgst]), `${taxable} @ ${rate}`).toBe(s.tax);
        expect(s.igst).toBe("0.00");
        expect(toPaise(s.tax) % BigInt(2)).toBe(BigInt(0));
      }
    }
  });
  it("splitGst inter-state: all IGST, unrounded", () => {
    expect(splitGst("100.25", 18, false)).toEqual({ tax: "18.05", cgst: "0.00", sgst: "0.00", igst: "18.05" });
  });
  it("a tax that is already even is not changed", () => {
    expect(splitGst("100000.00", 18, true)).toEqual({ tax: "18000.00", cgst: "9000.00", sgst: "9000.00", igst: "0.00" });
  });
  it("splitTaxAmount (GST TDS) gives equal halves or IGST", () => {
    expect(splitTaxAmount("2000.01", true)).toEqual({ cgst: "1000.01", sgst: "1000.01", igst: "0.00" });
    expect(splitTaxAmount("2000.01", false)).toEqual({ cgst: "0.00", sgst: "0.00", igst: "2000.01" });
  });
});

describe("B20: outstanding is clamped and compared in paise", () => {
  it("never goes negative on over-receipt", () => {
    expect(outstandingMoney("1000.00", "1000.01")).toBe("0.00");
    expect(outstandingMoney("1000.00", "5000.00")).toBe("0.00");
    expect(outstandingMoney("1000.00", "999.99")).toBe("0.01");
    expect(outstandingMoney("1000.00", "0.00")).toBe("1000.00");
  });
  it("hasOutstanding sees a single paisa that floats would lose", () => {
    // 0.1 + 0.2 style drift: as floats 1e15 + 0.01 === 1e15, as paise it is still owed.
    expect(hasOutstanding("1000000000000.01", "1000000000000.00")).toBe(true);
    expect(hasOutstanding("1000.00", "1000.00")).toBe(false);
    expect(hasOutstanding("1000.00", "2000.00")).toBe(false);
  });
});

describe("B17: GSTIN and PAN validation", () => {
  const SAMPLE = "27AAPFU0939F1ZV"; // the widely published sample GSTIN

  it("computes the published sample's check character", () => {
    expect(gstinCheckChar(SAMPLE.slice(0, 14))).toBe("V");
    expect(isValidGstin(SAMPLE)).toBe(true);
    expect(gstinError(SAMPLE.toLowerCase())).toBeNull();
  });
  it("rejects a wrong check character", () => {
    expect(gstinError("27AAPFU0939F1ZA")).toMatch(/checksum/);
  });
  it("rejects wrong length, layout and non-existent state codes", () => {
    expect(gstinError("27AAPFU0939F1Z")).toMatch(/15 characters/);
    expect(gstinError("27AAPFU0939F2XV")).toMatch(/format/); // 14th character must be Z
    expect(gstinError(withValidCheckChar("00AAPFU0939F1ZV"))).toMatch(/state code 00/);
    expect(gstinError(withValidCheckChar("40AAPFU0939F1ZV"))).toMatch(/state code 40/);
    expect(isValidGstStateCode("37")).toBe(true);
    expect(isValidGstStateCode("99")).toBe(true);
    expect(isValidGstStateCode("39")).toBe(false);
  });
  it("rejects a PAN with a bad holder-type letter inside the GSTIN", () => {
    expect(gstinError(makeGstin("27", "AAPXU0939F"))).toMatch(/PAN/);
  });
  it("makeGstin builds a GSTIN that validates and round-trips its parts", () => {
    const g = makeGstin("33", "AAECS4128K");
    expect(g).toHaveLength(15);
    expect(isValidGstin(g)).toBe(true);
    expect(gstinStateCode(g)).toBe("33");
    expect(gstinPan(g)).toBe("AAECS4128K");
    expect(withValidCheckChar(g.slice(0, 14) + "0")).toBe(g);
  });
  it("PAN format: 5 letters, 4 digits, 1 letter, valid holder type", () => {
    expect(isValidPan("AAECS4128K")).toBe(true);
    expect(isValidPan("aaecs4128k")).toBe(true);
    expect(isValidPan("AAEXS4128K")).toBe(false); // X is not a holder type
    expect(isValidPan("AAECS412K")).toBe(false);
    expect(isValidPan("1AECS4128K")).toBe(false);
    expect(isValidPan("")).toBe(false);
  });
});
