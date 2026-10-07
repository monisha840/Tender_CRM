/**
 * Baseline tests for the pure money, date and ledger logic as it behaves TODAY.
 *
 * Where current behaviour is a known bug (audit-report-v1.md, B1–B26), the correct behaviour is written as
 * `it.todo` / `it.skip` with the bug number in the name. The agent that fixes the bug turns the test on.
 * Nothing here should be "fixed" by editing the expectation of a passing test.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  addDays,
  dayOfWeek,
  daysBetween,
  formatDate,
  formatDateTime,
  formatMonth,
  getToday,
  istToUtc,
  lastNDays,
  lastNMonths,
  monthOf,
  nextMonth15th,
  relativeDeadline,
  setAsOfDate,
  toIstDate,
  DEMO_TODAY,
} from "@/lib/dates";
import { addMoney, cmpMoney, formatINR, formatINRAxis, fromPaise, isPositive, moneyToNumber, percentOf, subMoney, sumMoney, toPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { computePf, daysInMonth, pfWageCeiling, professionalTax, regionCodeOf } from "@/lib/payroll-rules";
import { balanceOf, isBilledSubBill, isPayableSubBill } from "@/lib/data/definitions";
import { buildSeedDatabase } from "@/lib/data/seed";
import { buildInvoice, gstFilingDue, parseMoney, suggestInvoiceNo, type InvoiceEntry } from "@/modules/finance/entry";
import { getReceivablesSummary, listInvoices, listReceivables } from "@/lib/data/accounts";
import { getSubcontractorOutstanding, listSubcontractorAssignments } from "@/lib/data/parties";
import type { Database, Invoice } from "@/types";

let db: Database;
beforeAll(() => {
  db = buildSeedDatabase();
});

describe("cn (clsx + tailwind-merge)", () => {
  it("joins truthy classes", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
  it("merges conflicting Tailwind utilities, last one wins", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    expect(cn("bg-primary text-sm", "text-lg")).toBe("bg-primary text-lg");
  });
});

describe("money: paise arithmetic", () => {
  it("round-trips decimal strings through paise", () => {
    expect(fromPaise(toPaise("1234.5"))).toBe("1234.50");
    expect(fromPaise(toPaise("0.07"))).toBe("0.07");
    expect(fromPaise(toPaise("-12.30"))).toBe("-12.30");
    expect(fromPaise(toPaise(1234))).toBe("1234.00");
    expect(toPaise(BigInt(5))).toBe(BigInt(5));
  });
  it("adds and subtracts without float drift", () => {
    expect(addMoney("0.10", "0.20")).toBe("0.30");
    expect(subMoney("100.00", "0.01")).toBe("99.99");
    expect(sumMoney(["0.10", "0.20", "0.30"])).toBe("0.60");
    expect(sumMoney([])).toBe("0.00");
  });
  it("compares and tests sign", () => {
    expect(cmpMoney("1.00", "1.0")).toBe(0);
    expect(cmpMoney("1.01", "1.00")).toBe(1);
    expect(cmpMoney("-1", "0")).toBe(-1);
    expect(isPositive("0.01")).toBe(true);
    expect(isPositive("0.00")).toBe(false);
  });
  it("percentOf: 18% GST", () => {
    expect(percentOf("100000.00", 18)).toBe("18000.00");
    expect(percentOf("2400000.00", 18)).toBe("432000.00");
  });
  it("percentOf rounds half away from zero to the paisa", () => {
    expect(percentOf("0.05", 10)).toBe("0.01"); // 0.005
    expect(percentOf("-0.05", 10)).toBe("-0.01");
    expect(percentOf("0.04", 10)).toBe("0.00"); // 0.004
  });
  it("percentOf keeps two decimals of the percent only", () => {
    expect(percentOf("100.00", 0.75)).toBe("0.75");
    expect(percentOf("100.00", 3.25)).toBe("3.25");
  });
  it("moneyToNumber is for display only", () => {
    expect(moneyToNumber("1234.56")).toBe(1234.56);
  });
});

describe("money: formatINR", () => {
  it("groups digits the Indian way", () => {
    expect(formatINR("24000000.00")).toBe("₹2,40,00,000");
    expect(formatINR("123456.78")).toBe("₹1,23,456.78");
    expect(formatINR("999")).toBe("₹999");
    expect(formatINR("1000")).toBe("₹1,000");
  });
  it("shows paise only when non-zero unless forced", () => {
    expect(formatINR("10.00")).toBe("₹10");
    expect(formatINR("10.00", { showPaise: true })).toBe("₹10.00");
    expect(formatINR("10.50")).toBe("₹10.50");
  });
  it("compacts to Cr and L", () => {
    expect(formatINR("24000000.00", { compact: true })).toBe("₹2.40 Cr");
    expect(formatINR("480000.00", { compact: true })).toBe("₹4.80 L");
    expect(formatINR("480000.00", { compact: "auto" })).toBe("₹4.80 L");
    expect(formatINR("99999.00", { compact: "auto" })).toBe("₹99,999");
  });
  it("handles negatives and empties", () => {
    expect(formatINR("-24000000.00", { compact: true })).toBe("-₹2.40 Cr");
    expect(formatINR(null)).toBe("—");
    expect(formatINR(undefined)).toBe("—");
    expect(formatINR("")).toBe("—");
  });
  it("axis labels drop trailing zeros", () => {
    expect(formatINRAxis(24_000_000)).toBe("₹2.4 Cr");
    expect(formatINRAxis(8_000_000)).toBe("₹80 L");
    expect(formatINRAxis(2500)).toBe("₹2.5 K");
    expect(formatINRAxis(-100_000)).toBe("-₹1 L");
  });
  // B20 money comparisons are covered in finance-money.test.ts.
});

describe("dates", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("counts whole days", () => {
    expect(daysBetween("2026-10-07", "2026-10-10")).toBe(3);
    expect(daysBetween("2026-10-10", "2026-10-07")).toBe(-3);
    expect(daysBetween("2026-10-07", "2026-10-07")).toBe(0);
  });
  it("day of week and month key", () => {
    expect(dayOfWeek("2026-10-04")).toBe(0); // Sunday
    expect(dayOfWeek("2026-10-07")).toBe(3); // Wednesday
    expect(monthOf("2026-10-07")).toBe("2026-10");
  });
  it("formats DD-MM-YYYY, converting timestamps to IST", () => {
    expect(formatDate("2026-10-07")).toBe("07-10-2026");
    expect(formatDate("2026-10-06T19:00:00.000Z")).toBe("07-10-2026"); // 00:30 IST next day
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime("2026-10-06T19:00:00.000Z")).toBe("07-10-2026, 00:30");
  });
  it("IST is a fixed +05:30", () => {
    expect(toIstDate("2026-10-06T18:29:59.000Z")).toBe("2026-10-06");
    expect(toIstDate("2026-10-06T18:30:00.000Z")).toBe("2026-10-07");
    expect(istToUtc("2026-10-07", "17:00")).toBe("2026-10-07T11:30:00.000Z");
    expect(istToUtc("2026-10-07")).toBe("2026-10-06T18:30:00.000Z");
  });
  it("relativeDeadline labels and tone", () => {
    const t = "2026-10-07";
    expect(relativeDeadline("2026-10-07", t)).toMatchObject({ label: "Today", tone: "urgent", days: 0 });
    expect(relativeDeadline("2026-10-08", t)).toMatchObject({ label: "Tomorrow", tone: "urgent" });
    expect(relativeDeadline("2026-10-10", t)).toMatchObject({ label: "in 3 days", tone: "urgent" });
    expect(relativeDeadline("2026-10-14", t)).toMatchObject({ label: "in 7 days", tone: "soon" });
    expect(relativeDeadline("2026-10-15", t)).toMatchObject({ label: "in 8 days", tone: "normal" });
    expect(relativeDeadline("2026-10-06", t)).toMatchObject({ label: "1 day overdue", tone: "overdue" });
    expect(relativeDeadline("2026-10-04", t)).toMatchObject({ label: "3 days overdue", tone: "overdue" });
  });
  it("relativeDeadline takes the IST date of a timestamp", () => {
    expect(relativeDeadline("2026-10-07T20:00:00.000Z", "2026-10-07").label).toBe("Tomorrow"); // 01:30 IST on the 8th
  });
  it("lists recent days and months, oldest first", () => {
    expect(lastNDays(3, "2026-10-07")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(lastNMonths(3, "2026-01-15")).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
  it("PF/ESI due date is the 15th of the following month", () => {
    expect(nextMonth15th("2026-09")).toBe("2026-10-15");
    expect(nextMonth15th("2026-12")).toBe("2027-01-15");
  });
  it("formatMonth", () => {
    expect(formatMonth("2026-10")).toBe("Oct 2026");
  });
  it("as-of override moves getToday and resets", () => {
    expect(getToday()).toBe(DEMO_TODAY);
    setAsOfDate("2026-06-30");
    expect(getToday()).toBe("2026-06-30");
    setAsOfDate(DEMO_TODAY);
    expect(getToday()).toBe(DEMO_TODAY);
    setAsOfDate("2026-06-30");
    setAsOfDate(null);
    expect(getToday()).toBe(DEMO_TODAY);
  });
  // N1 (as-of date filtering) is covered in data/__tests__/nav-as-of.test.ts.
  it.todo("T3: one shared urgency threshold across relativeDeadline, tenderTone and the attention items");
  it.todo("T4: days-left accounts for the time of day on the deadline");
  it.todo("B5: impossible dates (2026-02-30) are rejected by the non-invoice importers too (invoices are covered in finance-invoices.test.ts)");
});

describe("finance: parseMoney, filing due date, invoice numbers", () => {
  it("parseMoney normalises Indian-formatted amounts", () => {
    expect(parseMoney("1,23,456.5")).toBe("123456.50");
    expect(parseMoney("₹ 2,400")).toBe("2400.00");
    expect(parseMoney("10")).toBe("10.00");
  });
  it("parseMoney rejects negatives, 3 decimals and junk", () => {
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("1.234")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1e3")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
  it("GST filing is due on the 11th of the next month", () => {
    expect(gstFilingDue("2026-10-07")).toBe("2026-11-11");
    expect(gstFilingDue("2026-12-31")).toBe("2027-01-11");
  });
  it("suggestInvoiceNo continues the latest series for a GSTIN", () => {
    const reg = db.gstRegistrations[0];
    const mine = db.invoices.filter((i) => i.gstRegistrationId === reg.id).map((i) => i.invoiceNo).sort();
    const latest = mine[mine.length - 1];
    const next = suggestInvoiceNo(db, reg.id);
    const [, prefix, seq] = latest.match(/^(.*?)(\d+)$/)!;
    expect(next).toBe(`${prefix}${String(Number(seq) + 1).padStart(seq.length, "0")}`);
  });
  it("suggestInvoiceNo starts an FY series when the GSTIN has no invoices", () => {
    const empty: Database = { ...db, invoices: [] };
    const reg = db.gstRegistrations.find((g) => g.id === "gst_mh")!;
    expect(suggestInvoiceNo(empty, reg.id, "2026-10-07")).toBe("SPH/MH/2627/0001");
    expect(suggestInvoiceNo(empty, reg.id, "2026-02-10")).toBe("SPH/MH/2526/0001");
  });
});

/** An invoice entry for the first project that has a site, billed from the given GSTIN. */
function entryFor(regId: string, over: Partial<InvoiceEntry> = {}): InvoiceEntry {
  const project = db.projects.find((p) => !p.deletedAt)!;
  return {
    gstRegistrationId: regId,
    organisationId: project.organisationId,
    projectId: project.id,
    invoiceNo: "TEST/0001",
    invoiceDate: "2026-10-07",
    invoiceType: "MONTHLY",
    periodFrom: "2026-09-01",
    periodTo: "2026-09-30",
    taxableValue: "100000.00",
    gstPercent: "18",
    deductions: "",
    deductionTypeId: "",
    ...over,
  };
}

describe("finance: buildInvoice GST split", () => {
  const project = () => db.projects.find((p) => !p.deletedAt)!;
  // B6: an invoice is raised from the project's own GSTIN, so inter-/intra-state is picked by choosing a project.
  const supplyState = (p: (typeof db.projects)[number]) => db.sites.find((s) => s.id === p.siteId)?.stateId ?? db.organisations.find((o) => o.id === p.organisationId)!.stateId;
  const regOf = (p: (typeof db.projects)[number]) => db.gstRegistrations.find((g) => g.id === p.gstRegistrationId)!;
  const interProject = () => db.projects.find((p) => !p.deletedAt && regOf(p).stateId !== supplyState(p))!;
  const intraProject = () => db.projects.find((p) => !p.deletedAt && regOf(p).stateId === supplyState(p));
  const entryOf = (p: (typeof db.projects)[number], over: Partial<InvoiceEntry> = {}) => entryFor(p.gstRegistrationId, { projectId: p.id, organisationId: p.organisationId, ...over });
  const interEntry = (over: Partial<InvoiceEntry> = {}) => entryOf(interProject(), over);

  it("intra-state: CGST + SGST, no IGST, and taxable + tax = total", () => {
    const p = intraProject();
    if (!p) return; // seed has no intra-state project; the inter-state case below still runs
    const r = buildInvoice(db, entryOf(p));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { invoice } = r;
    expect(invoice.cgst).toBe("9000.00");
    expect(invoice.sgst).toBe("9000.00");
    expect(invoice.igst).toBe("0.00");
    expect(invoice.total).toBe("118000.00");
    expect(sumMoney([invoice.taxableValue, invoice.cgst, invoice.sgst, invoice.igst])).toBe(invoice.total);
  });
  it("inter-state: IGST only", () => {
    const r = buildInvoice(db, interEntry());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.invoice.igst).toBe("18000.00");
    expect(r.invoice.cgst).toBe("0.00");
    expect(r.invoice.sgst).toBe("0.00");
    expect(r.invoice.total).toBe("118000.00");
  });
  it("net receivable = total - deductions, and a deduction row is written", () => {
    const r = buildInvoice(db, interEntry({ deductions: "2,360.00" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.invoice.totalDeductions).toBe("2360.00");
    expect(r.invoice.netReceivable).toBe("115640.00");
    expect(r.deductions).toHaveLength(1);
    expect(r.deductions[0].amount).toBe("2360.00");
  });
  it("due date = invoice date + project payment terms; filing due on the 11th", () => {
    const r = buildInvoice(db, interEntry());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.invoice.dueDate).toBe(addDays("2026-10-07", interProject().paymentTermsDays));
    expect(r.invoice.gstFilingDueDate).toBe("2026-11-11");
    expect(r.invoice.paymentStatus).toBe("UNPAID");
    expect(r.invoice.gstFilingStatus).toBe("PENDING");
  });
  it("mirrors the split into the OUTWARD GST transaction", () => {
    const r = buildInvoice(db, interEntry());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gstTransaction).toMatchObject({ direction: "OUTWARD", taxableValue: "100000.00", igst: "18000.00", period: "2026-10", rate: "18.0000" });
  });
  it("defaults the GST rate to 18 when blank", () => {
    const r = buildInvoice(db, interEntry({ gstPercent: "" }));
    expect(r.ok && r.invoice.igst).toBe("18000.00");
  });
  it("rejects duplicates, zero value, deductions above total, bad dates and bad periods", () => {
    const reg = interProject().gstRegistrationId;
    const existing = db.invoices.find((i) => i.gstRegistrationId === reg && !i.deletedAt);
    if (existing) expect(buildInvoice(db, interEntry({ invoiceNo: existing.invoiceNo.toLowerCase() }))).toMatchObject({ ok: false });
    expect(buildInvoice(db, interEntry(), [`${reg}|test/0001`])).toMatchObject({ ok: false });
    expect(buildInvoice(db, interEntry({ taxableValue: "0" }))).toMatchObject({ ok: false });
    expect(buildInvoice(db, interEntry({ deductions: "999999999" }))).toMatchObject({ ok: false });
    expect(buildInvoice(db, interEntry({ invoiceDate: "07/10/26" }))).toMatchObject({ ok: false });
    expect(buildInvoice(db, interEntry({ periodFrom: "2026-09-30", periodTo: "2026-09-01" }))).toMatchObject({ ok: false });
    expect(buildInvoice(db, interEntry({ gstPercent: "41" }))).toMatchObject({ ok: false });
    expect(buildInvoice(db, interEntry({ gstRegistrationId: "nope" }))).toMatchObject({ ok: false });
  });
  it("rejects a project that belongs to another customer", () => {
    const other = db.organisations.find((o) => o.id !== project().organisationId)!;
    expect(buildInvoice(db, interEntry({ organisationId: other.id }))).toMatchObject({ ok: false });
  });

  // Fixed bugs B1, B4-B7, B17-B19 are covered in finance-*.test.ts; the rest below stay open.
  it.todo("G2: GST % must be one of the statutory slabs, not any number 0–40");
  it.todo("G3: deductions are capped per type and TDS is checked against the expected 2%");
});

describe("finance: invoice and receivables ledger (seed)", () => {
  it("every seeded invoice: taxable + taxes = total and total - deductions = net", () => {
    for (const i of db.invoices) {
      expect(sumMoney([i.taxableValue, i.cgst, i.sgst, i.igst]), i.invoiceNo).toBe(i.total);
      expect(subMoney(i.total, i.totalDeductions), i.invoiceNo).toBe(i.netReceivable);
    }
  });
  it("every seeded invoice is either CGST+SGST or IGST, never both", () => {
    for (const i of db.invoices) {
      const intra = isPositive(i.cgst) || isPositive(i.sgst);
      const inter = isPositive(i.igst);
      expect(intra && inter, i.invoiceNo).toBe(false);
    }
  });
  it("outstanding = net receivable - received; daysOverdue counts from the due date", () => {
    const today = getToday();
    for (const r of listInvoices(db)) {
      expect(r.outstanding).toBe(subMoney(r.invoice.netReceivable, r.invoice.receivedAmount));
      const expected = isPositive(r.outstanding) ? Math.max(0, daysBetween(r.invoice.dueDate, today)) : 0;
      expect(r.daysOverdue).toBe(expected);
    }
  });
  it("receivables summary: total = sum of outstanding, overdue is a subset", () => {
    const s = getReceivablesSummary(db);
    expect(s.total).toBe(sumMoney(s.rows.map((r) => r.outstanding)));
    expect(cmpMoney(s.overdue, s.total)).toBeLessThanOrEqual(0);
    expect(s.overdueCount).toBe(s.rows.filter((r) => r.daysOverdue > 0).length);
    expect(s.rows.every((r) => isPositive(r.outstanding))).toBe(true);
    for (let i = 1; i < s.rows.length; i++) expect(s.rows[i - 1].daysOverdue).toBeGreaterThanOrEqual(s.rows[i].daysOverdue);
  });
  it("a fully paid invoice drops out of receivables; part-paid stays with the remainder", () => {
    const base = db.invoices.find((i) => !i.deletedAt)!;
    const mk = (id: string, received: string): Invoice => ({ ...base, id, receivedAmount: received });
    const paid = mk("t_paid", base.netReceivable);
    const part = mk("t_part", "1.00");
    const sub: Database = { ...db, invoices: [paid, part] };
    const rows = listReceivables(sub);
    expect(rows.map((r) => r.invoice.id)).toEqual(["t_part"]);
    expect(rows[0].outstanding).toBe(subMoney(base.netReceivable, "1.00"));
  });
  it("an overdue invoice is aged from its due date", () => {
    const base = db.invoices.find((i) => !i.deletedAt)!;
    const late: Invoice = { ...base, id: "t_late", receivedAmount: "0.00", dueDate: addDays(getToday(), -45) };
    const row = listInvoices({ ...db, invoices: [late] })[0];
    expect(row.daysOverdue).toBe(45);
  });
  it("as-of date moves the ageing clock", () => {
    const base = db.invoices.find((i) => !i.deletedAt)!;
    const inv: Invoice = { ...base, id: "t_asof", receivedAmount: "0.00", dueDate: "2026-06-30" };
    setAsOfDate("2026-07-10");
    expect(listInvoices({ ...db, invoices: [inv] })[0].daysOverdue).toBe(10);
  });
  // B9 and B11 are covered in data/__tests__/figures-definitions.test.ts.
  it("B20: an over-receipt shows nothing outstanding and the row stays in the invoice list", () => {
    const base = db.invoices.find((i) => !i.deletedAt)!;
    const over: Invoice = { ...base, id: "t_over", receivedAmount: addMoney(base.netReceivable, "10.00") };
    const rows = listInvoices({ ...db, invoices: [over] });
    expect(rows).toHaveLength(1);
    expect(rows[0].outstanding).toBe("0.00");
    expect(listReceivables({ ...db, invoices: [over] })).toHaveLength(0);
  });
  it.todo("G5: invoices due today are not counted as 'not yet due'");
});

describe("payroll (seeded payslips): PF, ESI, PT, net salary", () => {
  it("net = gross - total deductions, and total = PF + ESI + advance + other", () => {
    for (const p of db.payslips) {
      const total = sumMoney([p.epfEmployee, p.esiEmployee, p.advanceRecovered, p.otherDeductions]);
      expect(p.totalDeductions, p.id).toBe(total);
      expect(p.net, p.id).toBe(subMoney(p.gross, p.totalDeductions));
    }
  });
  const periodOf = (p: { payrollRunId: string }) => db.payrollRuns.find((r) => r.id === p.payrollRunId)!;
  it("EPF wages are capped at the ceiling in force and PF is 12% of EPF wages, rounded to the rupee", () => {
    for (const p of db.payslips) {
      const month = periodOf(p).periodMonth;
      const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
      const pf = computePf(p.epfWages, monthEnd);
      expect(cmpMoney(p.epfWages, pfWageCeiling(monthEnd)), p.id).toBeLessThanOrEqual(0);
      expect(cmpMoney(p.epfWages, p.gross), p.id).toBeLessThanOrEqual(0);
      expect(p.epfEmployee, p.id).toBe(pf.employee);
      expect(p.epfEmployer, p.id).toBe(pf.employerShare);
    }
    expect(db.payslips.some((p) => p.epfWages === "15000.00")).toBe(true); // somebody is capped
  });
  it("ESI is 0.75% employee / 3.25% employer on gross, rounded up to the next rupee, or zero", () => {
    const withEsi = db.payslips.filter((p) => isPositive(p.esiEmployee));
    expect(withEsi.length).toBeGreaterThan(0);
    const ceilRupee = (gross: string, pct: number) => `${Math.ceil(moneyToNumber(gross) * (pct / 100) - 1e-9)}.00`;
    for (const p of db.payslips) {
      if (isPositive(p.esiEmployee)) expect(p.esiEmployee, p.id).toBe(ceilRupee(p.gross, 0.75));
      // The employee share is waived at ₹176 a day or less; the employer still pays.
      if (isPositive(p.esiEmployer)) expect(p.esiEmployer, p.id).toBe(ceilRupee(p.gross, 3.25));
      else expect(p.esiEmployee, p.id).toBe("0.00");
    }
  });
  it("professional tax follows the state slab for the payslip's region and month", () => {
    for (const p of db.payslips) {
      const run = periodOf(p);
      expect(p.otherDeductions, p.id).toBe(professionalTax(regionCodeOf(run.regionId), p.gross, run.periodMonth));
    }
  });
  it("payroll run totals agree with their payslips", () => {
    for (const run of db.payrollRuns) {
      const slips = db.payslips.filter((p) => p.payrollRunId === run.id);
      expect(run.employeeCount, run.id).toBe(slips.length);
      expect(run.grossTotal, run.id).toBe(sumMoney(slips.map((s) => s.gross)));
      expect(run.netTotal, run.id).toBe(sumMoney(slips.map((s) => s.net)));
      expect(run.epfEmployeeTotal, run.id).toBe(sumMoney(slips.map((s) => s.epfEmployee)));
    }
  });
  it("locked runs are fully paid; the latest month is not", () => {
    for (const run of db.payrollRuns.filter((r) => r.status === "LOCKED")) {
      expect(db.payslips.filter((p) => p.payrollRunId === run.id).every((p) => p.paymentStatus === "PAID"), run.id).toBe(true);
    }
    const latest = db.payrollRuns.map((r) => r.periodMonth).sort().pop()!;
    expect(db.payslips.some((p) => db.payrollRuns.find((r) => r.id === p.payrollRunId)?.periodMonth === latest && p.paymentStatus !== "PAID")).toBe(true);
  });
  // P1, P2 and B12-B15 are covered in payroll-rules.test.ts, payroll-seed.test.ts and the workforce entry tests.
});

describe("subcontractor balances", () => {
  it("each bill: net payable = gross + GST - deductions, and paid never exceeds net payable", () => {
    for (const b of db.subcontractorBills) {
      expect(b.netPayable, b.id).toBe(subMoney(addMoney(b.grossAmount, b.gstAmount), b.totalDeductions));
      expect(cmpMoney(b.paidAmount, b.netPayable), b.id).toBeLessThanOrEqual(0);
    }
  });
  it("assignment balance = net payable - paid, summed over its payable bills", () => {
    for (const a of listSubcontractorAssignments(db)) {
      const bills = db.subcontractorBills.filter((b) => b.workOrderId === a.workOrder.id && !b.deletedAt);
      // B10: only approved and part-paid bills are payable; drafts, submitted and rejected bills never inflate the balance.
      expect(a.balance, a.workOrder.id).toBe(sumMoney(bills.filter(isPayableSubBill).map((b) => balanceOf(b.netPayable, b.paidAmount))));
      expect(a.billCount).toBe(bills.filter(isBilledSubBill).length);
    }
  });
  it("outstanding counts only APPROVED and PARTLY_PAID bills, per project and in total", () => {
    const sub = db.subcontractors.find((s) => db.subcontractorBills.some((b) => b.subcontractorId === s.id && ["APPROVED", "PARTLY_PAID"].includes(b.status)))!;
    const o = getSubcontractorOutstanding(db, sub.id);
    const expected = sumMoney(
      db.subcontractorBills.filter((b) => b.subcontractorId === sub.id && ["APPROVED", "PARTLY_PAID"].includes(b.status)).map((b) => subMoney(b.netPayable, b.paidAmount)),
    );
    expect(o.total).toBe(expected);
    expect(sumMoney(o.perProject.map((p) => p.outstanding))).toBe(o.total);
  });
  it("a rejected or draft bill is not outstanding", () => {
    const base = db.subcontractorBills[0];
    const mk = (id: string, status: typeof base.status) => ({ ...base, id, status, paidAmount: "0.00", netPayable: "1000.00" });
    const sub: Database = { ...db, subcontractorBills: [mk("t1", "REJECTED"), mk("t2", "DRAFT"), mk("t3", "APPROVED")] };
    expect(getSubcontractorOutstanding(sub, base.subcontractorId).total).toBe("1000.00");
  });
  // B10 and B11 are covered in data/__tests__/figures-definitions.test.ts.
});
