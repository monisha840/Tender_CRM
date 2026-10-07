import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { loadFinance } from "../load-finance";
import { loadWorkforce } from "../load-workforce";
import { mapRow, toIsoDate, toMoney, toPercent, toQty } from "../row-mapper";

const D = (v: string) => new Prisma.Decimal(v);
const T = new Date("2026-03-04T10:15:00.000Z");
const meta = { id: "x1", createdAt: T, updatedAt: T, deletedAt: null, createdById: "u1", updatedById: "u1", version: 3 };

describe("row mapper conversions", () => {
  it("formats decimals to fixed strings, never floats", () => {
    expect(toMoney(D("23100000"))).toBe("23100000.00");
    expect(toMoney(D("0.1").plus(D("0.2")))).toBe("0.30");
    expect(toQty(D("12"))).toBe("12.000");
    expect(toPercent(D("18"))).toBe("18.0000");
  });
  it("converts @db.Date to YYYY-MM-DD and timestamps to ISO", () => {
    expect(toIsoDate(new Date("2026-03-04T00:00:00.000Z"))).toBe("2026-03-04");
    const out = mapRow<{ deletedAt: string | null; createdAt: string }>({ ...meta }, {});
    expect(out.createdAt).toBe("2026-03-04T10:15:00.000Z");
    expect(out.deletedAt).toBeNull();
  });
  it("drops audit columns and maps missing optionals to null", () => {
    const out = mapRow<Record<string, unknown>>({ ...meta, name: "A", phone: null }, { str: ["name", "phone"], optional: ["phone"] });
    expect(out).toEqual({ id: "x1", createdAt: T.toISOString(), updatedAt: T.toISOString(), deletedAt: null, name: "A", phone: null });
  });
  it("rejects a null for a required decimal", () => {
    expect(() => mapRow({ ...meta, amount: null }, { money: ["amount"] })).toThrow();
  });
});

const delegate = (rows: unknown[]) => ({ findMany: vi.fn().mockResolvedValue(rows) });

describe("loadFinance", () => {
  it("maps rows to Database shapes and applies soft-delete and scope filters", async () => {
    const invoice = {
      ...meta, id: "inv1", gstRegistrationId: "gst_cg", invoiceNo: "SP/001", invoiceDate: new Date("2026-02-01"), organisationId: "org1", customerGstin: "22AAAAA0000A1Z5",
      projectId: "p1", regionId: "reg_cg", invoiceType: "MONTHLY", periodFrom: new Date("2026-01-01"), periodTo: new Date("2026-01-31"), taxableValue: D("100000"),
      cgst: D("9000"), sgst: D("9000"), igst: D("0"), total: D("118000"), totalDeductions: D("5000"), netReceivable: D("113000"), receivedAmount: D("0"),
      dueDate: new Date("2026-03-03"), paymentStatus: "UNPAID", gstFilingStatus: "PENDING", filingReference: null, gstFilingDueDate: new Date("2026-02-11"),
    };
    const prisma = {
      invoice: delegate([invoice]),
      payment: delegate([]),
      retentionEntry: delegate([]),
      gstTransaction: delegate([{ ...meta, id: "g1", gstRegistrationId: "gst_cg", direction: "OUTWARD", sourceType: "INVOICE", sourceId: "inv1", partyName: "NTPC", partyGstin: null, invoiceNo: "SP/001", invoiceDate: new Date("2026-02-01"), period: "2026-02", taxableValue: D("100000"), cgst: D("9000"), sgst: D("9000"), igst: D("0"), itcEligible: false, rate: D("18") }]),
      purchaseRequest: delegate([{ ...meta, id: "pr1", requestNo: "PR-1", projectId: "p1", siteId: "s1", regionId: "reg_cg", requestedById: "u1", neededBy: new Date("2026-03-10"), status: "DRAFT", estimatedAmount: D("5000.5"), approvalRequestId: null }]),
      purchaseOrder: delegate([]),
      vendorInvoice: delegate([]),
      stockTransaction: delegate([{ ...meta, id: "st1", siteId: "s1", projectId: "p1", materialId: "m1", type: "RECEIPT", quantity: D("10"), rate: D("12.5"), date: new Date("2026-03-01") }]),
      invoiceDeduction: delegate([{ ...meta, id: "d1", invoiceId: "inv1", deductionTypeId: "ded_retention", amount: D("5000") }]),
      purchaseRequestItem: delegate([{ ...meta, id: "pri1", requestId: "pr1", materialId: "m1", quantity: D("3") }]),
    };
    const out = await loadFinance(prisma as unknown as PrismaClient, { regionIds: ["reg_cg"] });
    expect(out.invoices?.[0]).toMatchObject({ invoiceNo: "SP/001", invoiceDate: "2026-02-01", total: "118000.00", filingReference: null, deletedAt: null });
    expect(out.gstTransactions?.[0]).toMatchObject({ rate: "18.0000", partyGstin: null, period: "2026-02" });
    expect(out.purchaseRequests?.[0].estimatedAmount).toBe("5000.50");
    expect(out.purchaseRequestItems?.[0].quantity).toBe("3.000");
    expect(out.stockTransactions?.[0]).toMatchObject({ quantity: "10.000", rate: "12.50", date: "2026-03-01" });
    expect(out.invoiceDeductions).toHaveLength(1);
    expect(prisma.invoice.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, regionId: { in: ["reg_cg"] } });
    expect(prisma.invoiceDeduction.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, invoiceId: { in: ["inv1"] } });
    expect(prisma.gstTransaction.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null });
  });
});

describe("loadWorkforce", () => {
  it("maps workforce rows, numbers for fractions, and scopes children through parents", async () => {
    const prisma = {
      employee: delegate([{ ...meta, id: "e1", code: "E001", name: "Ravi", phone: null, homeRegionId: "reg_cg", userId: null }]),
      employeeProfile: delegate([{ ...meta, id: "ep1", employeeId: "e1", designation: "Supervisor", department: "Site Operations", labourTypeId: "lt1", joiningDate: new Date("2024-04-01"), exitDate: null, wageAmount: D("28000"), pfApplicable: true, esiApplicable: false, advanceBalance: D("0"), uan: null, contractorId: null }]),
      labourType: delegate([{ ...meta, id: "lt1", name: "Permanent", payrollMode: "MONTHLY", isActive: true }]),
      attendance: delegate([{ ...meta, id: "a1", employeeId: "e1", siteId: "s1", projectId: "p1", regionId: "reg_cg", date: new Date("2026-03-02"), status: "HALF_DAY", dayFraction: D("0.5"), overtimeMinutes: 60, source: "SUPERVISOR", markedById: "u1", clientUuid: "c-1" }]),
      payrollRun: delegate([{ ...meta, id: "run1", periodMonth: "2026-02", regionId: "reg_cg", status: "DRAFT", employeeCount: 1, grossTotal: D("28000"), epfEmployeeTotal: D("1800"), epfEmployerTotal: D("1800"), netTotal: D("26200"), lockedAt: null, approvalRequestId: null }]),
      siteAssignment: delegate([{ ...meta, id: "sa1", employeeId: "e1", siteId: "s1", projectId: "p1", role: "Supervisor", fromDate: new Date("2026-01-01"), toDate: null, reason: null, assignedById: "u2" }]),
      payslip: delegate([{ ...meta, id: "ps1", payrollRunId: "run1", employeeId: "e1", daysWorked: D("26"), overtimeAmount: D("0"), gross: D("28000"), epfWages: D("15000"), epfEmployee: D("1800"), epfEmployer: D("1800"), advanceRecovered: D("0"), esiEmployee: D("0"), esiEmployer: D("0"), otherDeductions: D("200"), totalDeductions: D("2000"), net: D("26000"), paymentStatus: "PENDING", paidOn: null }]),
    };
    const out = await loadWorkforce(prisma as unknown as PrismaClient, { regionIds: ["reg_cg"], projectIds: ["p1"] });
    expect(out.employees?.[0]).toMatchObject({ code: "E001", phone: null, userId: null });
    expect(out.employeeProfiles?.[0]).toMatchObject({ wageAmount: "28000.00", joiningDate: "2024-04-01", exitDate: null });
    expect(out.attendance?.[0]).toMatchObject({ dayFraction: 0.5, overtimeMinutes: 60, date: "2026-03-02" });
    expect(out.payslips?.[0]).toMatchObject({ daysWorked: 26, net: "26000.00", paidOn: null });
    expect(out.payrollRuns?.[0].lockedAt).toBeNull();
    expect(out.siteAssignments?.[0].toDate).toBeNull();
    expect(prisma.employee.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, homeRegionId: { in: ["reg_cg"] } });
    expect(prisma.attendance.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, regionId: { in: ["reg_cg"] }, projectId: { in: ["p1"] } });
    expect(prisma.payslip.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, payrollRunId: { in: ["run1"] } });
  });
});
