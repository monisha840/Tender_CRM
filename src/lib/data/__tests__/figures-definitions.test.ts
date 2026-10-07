import { describe, expect, it } from "vitest";
import { moneyToNumber, sumMoney } from "@/lib/money";
import { buildSeedDatabase } from "@/lib/data/seed";
import type { Database } from "@/types";
import { getGstSummary, listGstTransactions } from "../gst";
import { getPayablesSummary, getProjectBilling, getReceivablesSummary, listPayables, listReceivables } from "../accounts";
import { getDashboard } from "../dashboard13";
import { ageingBucketOf, ageingTotals, balanceOf, daysPastDue, isApprovedSubBill, isLive, isOnPayroll, isPayableSubBill, isPayableVendorInvoice } from "../definitions";
import { listSubcontractorAssignments, listSubcontractors } from "../parties";
import { listProjects } from "../projects";

const fresh = (): Database => structuredClone(buildSeedDatabase());
const num = (m: string) => moneyToNumber(m);

describe("B9 ageing: days past due, buckets 0-30 / 31-60 / 61-90 / 90+", () => {
  it("measures from the due date, never below zero", () => {
    expect(daysPastDue("2026-10-07", "2026-10-07")).toBe(0);
    expect(daysPastDue("2026-10-20", "2026-10-07")).toBe(0);
    expect(daysPastDue("2026-09-07", "2026-10-07")).toBe(30);
  });
  it("puts boundaries in the right bucket", () => {
    const cases: [number, string][] = [[0, "0–30"], [30, "0–30"], [31, "31–60"], [60, "31–60"], [61, "61–90"], [90, "61–90"], [91, "90+"], [400, "90+"]];
    cases.forEach(([d, b]) => expect(ageingBucketOf(d)).toBe(b));
  });
  it("always returns all four buckets and keeps money exact", () => {
    const t = ageingTotals([{ d: 5, m: "0.10" }, { d: 6, m: "0.20" }, { d: 95, m: "10.00" }], (r) => r.d, (r) => r.m);
    expect(t.map((b) => b.bucket)).toEqual(["0–30", "31–60", "61–90", "90+"]);
    expect(t[0].amount).toBeCloseTo(0.3, 10);
    expect(t[3]).toMatchObject({ count: 1, amount: 10 });
  });
  it("Finance and dashboard give identical ageing for the same data, for every region filter", () => {
    const db = buildSeedDatabase();
    for (const region of ["ALL", ...db.regions.map((r) => r.id)]) {
      const dash = getDashboard(db, region).receivables;
      // The Finance tab derives its buckets from listReceivables rows via the same definition.
      const finance = ageingTotals(listReceivables(db, region), (r) => r.daysOverdue, (r) => r.outstanding);
      expect(dash.aging).toEqual(finance);
      expect(dash.aging.reduce((t, b) => t + b.amount, 0)).toBeCloseTo(num(dash.total), 2);
      expect(dash.total).toBe(getReceivablesSummary(db, region).total);
    }
  });
});

describe("B10 payable / balance: one status rule, rejected never counts", () => {
  it("only approved and part-paid bills are payable", () => {
    expect(isPayableSubBill({ status: "APPROVED" })).toBe(true);
    expect(isPayableSubBill({ status: "PARTLY_PAID" })).toBe(true);
    for (const status of ["DRAFT", "SUBMITTED", "REJECTED", "PAID"] as const) expect(isPayableSubBill({ status })).toBe(false);
    expect(isPayableSubBill({ status: "APPROVED", deletedAt: "2026-01-01T00:00:00Z" })).toBe(false);
    expect(isApprovedSubBill({ status: "REJECTED" })).toBe(false);
    expect(isPayableVendorInvoice({ status: "RECEIVED" })).toBe(false);
    expect(isPayableVendorInvoice({ status: "APPROVED" })).toBe(true);
  });
  it("balanceOf is clamped at zero", () => {
    expect(balanceOf("100.00", "40.00")).toBe("60.00");
    expect(balanceOf("100.00", "140.00")).toBe("0.00");
  });
  it("dashboard, Finance payables, subcontractor list and assignments agree", () => {
    const db = buildSeedDatabase();
    const dash = getDashboard(db).subcontractorPending.balance;
    const finance = sumMoney(listPayables(db).filter((p) => p.kind === "SUBCONTRACTOR_BILL").map((p) => p.outstanding));
    const subs = sumMoney(listSubcontractors(db).map((s) => s.outstanding));
    const assignments = sumMoney(listSubcontractorAssignments(db).map((a) => a.balance));
    expect(num(dash)).toBeGreaterThan(0);
    expect(finance).toBe(dash);
    expect(subs).toBe(dash);
    expect(assignments).toBe(dash);
  });
  it("a rejected, draft or submitted bill changes none of them", () => {
    const base = buildSeedDatabase();
    const before = {
      dash: getDashboard(base).subcontractorPending.balance,
      assignments: sumMoney(listSubcontractorAssignments(base).map((a) => a.balance)),
      payables: getPayablesSummary(base).total,
    };
    const db = fresh();
    const template = db.subcontractorBills.find((b) => b.status === "APPROVED")!;
    (["REJECTED", "DRAFT", "SUBMITTED"] as const).forEach((status, i) =>
      db.subcontractorBills.push({ ...template, id: `x-${i}`, status, netPayable: "9999999.00", paidAmount: "0.00", grossAmount: "9999999.00" }),
    );
    expect(getDashboard(db).subcontractorPending.balance).toBe(before.dash);
    expect(sumMoney(listSubcontractorAssignments(db).map((a) => a.balance))).toBe(before.assignments);
    expect(getPayablesSummary(db).total).toBe(before.payables);
  });
  it("a vendor invoice awaiting approval is not payable", () => {
    const db = fresh();
    const v = db.vendorInvoices[0];
    expect(v).toBeDefined();
    const before = getPayablesSummary(db).total;
    db.vendorInvoices.push({ ...v, id: "x-v", status: "RECEIVED", total: "5000000.00", paidAmount: "0.00" });
    expect(getPayablesSummary(db).total).toBe(before);
    db.vendorInvoices.push({ ...v, id: "x-v2", status: "APPROVED", total: "5000000.00", paidAmount: "0.00" });
    expect(num(getPayablesSummary(db).total)).toBeCloseTo(num(before) + 5000000, 2);
  });
});

describe("B11 soft-deleted rows are ignored by every total", () => {
  it("deleted invoice leaves project billing, dashboard billed and receivables, and GST filing counts", () => {
    const db = fresh();
    const inv = db.invoices.find((i) => num(i.taxableValue) > 0 && num(i.netReceivable) > num(i.receivedAmount))!;
    const beforeBilling = getProjectBilling(db, inv.projectId);
    const beforeDash = getDashboard(db);
    inv.deletedAt = "2026-10-01T00:00:00Z";
    const after = getProjectBilling(db, inv.projectId);
    const dash = getDashboard(db);
    expect(after.invoiceCount).toBe(beforeBilling.invoiceCount - 1);
    expect(num(after.billed)).toBeCloseTo(num(beforeBilling.billed) - num(inv.taxableValue), 2);
    expect(num(dash.projectValue.billedToDate)).toBeCloseTo(num(beforeDash.projectValue.billedToDate) - num(inv.taxableValue), 2);
    expect(num(dash.receivables.total)).toBeLessThan(num(beforeDash.receivables.total));
    expect(dash.gst.filed + dash.gst.pending).toBe(beforeDash.gst.filed + beforeDash.gst.pending - 1);
  });
  it("deleted subcontractor bill, GST row and project drop out", () => {
    const db = fresh();
    const bill = db.subcontractorBills.find((b) => b.status === "APPROVED" || b.status === "PARTLY_PAID")!;
    const before = getDashboard(db).subcontractorPending.balance;
    bill.deletedAt = "2026-10-01T00:00:00Z";
    expect(num(getDashboard(db).subcontractorPending.balance)).toBeLessThan(num(before));
    expect(listPayables(db).some((p) => p.id === bill.id)).toBe(false);

    const gstBefore = getGstSummary(db).outwardTax;
    const g = db.gstTransactions.find((t) => t.direction === "OUTWARD" && num(t.cgst) + num(t.sgst) + num(t.igst) > 0)!;
    g.deletedAt = "2026-10-01T00:00:00Z";
    expect(num(getGstSummary(db).outwardTax)).toBeLessThan(num(gstBefore));
    expect(listGstTransactions(db).some((t) => t.id === g.id)).toBe(false);

    const p = db.projects[0];
    p.deletedAt = "2026-10-01T00:00:00Z";
    expect(listProjects(db).some((r) => r.project.id === p.id)).toBe(false);
    expect(isLive(p)).toBe(false);
  });
  it("deleted employee leaves the headcount", () => {
    const db = fresh();
    const before = getDashboard(db).employees.total;
    db.employees[0].deletedAt = "2026-10-01T00:00:00Z";
    expect(getDashboard(db).employees.total).toBe(before - 1);
  });
});

describe("B24 billed is excl. GST; employee count has one definition", () => {
  it("project billed, project rows and the dashboard all use the taxable value", () => {
    const db = buildSeedDatabase();
    const rows = listProjects(db);
    const projectSum = sumMoney(rows.map((r) => r.billing.billed));
    expect(getDashboard(db).projectValue.billedToDate).toBe(projectSum);
    const taxable = sumMoney(db.invoices.filter(isLive).map((i) => i.taxableValue));
    expect(projectSum).toBe(taxable);
    const withGst = sumMoney(rows.map((r) => r.billing.invoicedTotal));
    expect(num(withGst)).toBeGreaterThan(num(projectSum));
  });
  it("headcount counts everyone live (directors too); on payroll needs a wage above zero", () => {
    const db = buildSeedDatabase();
    const e = getDashboard(db).employees;
    const live = db.employees.filter(isLive);
    expect(e.total).toBe(live.length);
    expect(e.onPayroll).toBe(live.filter((x) => isOnPayroll(db.employeeProfiles.find((p) => p.employeeId === x.id))).length);
    expect(e.onPayroll).toBeLessThanOrEqual(e.total);
    expect(isOnPayroll(null)).toBe(false);
    expect(isOnPayroll({ wageAmount: "0.00" })).toBe(false);
    expect(isOnPayroll({ wageAmount: "650.00" })).toBe(true);
  });
});

describe("GST net position", () => {
  it("net payable = output tax - ITC - TDS, and per-GSTIN figures add up to the total", () => {
    const db = buildSeedDatabase();
    const all = getGstSummary(db);
    expect(num(all.netPayable)).toBeCloseTo(num(all.outwardTax) - num(all.itcAvailable) - num(all.tdsReceived), 2);
    const parts = db.gstRegistrations.map((g) => getGstSummary(db, { gstRegistrationId: g.id }));
    expect(sumMoney(parts.map((p) => p.netPayable))).toBe(all.netPayable);
    expect(sumMoney(parts.map((p) => p.outwardTax))).toBe(all.outwardTax);
  });
});
