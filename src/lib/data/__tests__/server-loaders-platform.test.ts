import { describe, expect, it } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { mapBill, mapPayment, mapWorkOrder, mapParty } from "../server/load-parties";
import { mapApprovalRequest, mapApprovalAction, mapApprovalThreshold } from "../server/load-approvals";
import { mapAuditLog, mapDeductionType, mapNotification, mapSetting } from "../server/load-platform";
import { isoDate, liveWhere } from "../server/convert-platform";

const ts = new Date("2026-03-01T04:30:00.000Z");
const b = { id: "x1", createdAt: ts, updatedAt: ts, deletedAt: null };

describe("platform loader mappers", () => {
  it("maps work order decimals and dates", () => {
    const wo = mapWorkOrder({
      ...b,
      subcontractorId: "s",
      projectId: "p",
      siteId: null,
      regionId: "r",
      workOrderNo: "WO-1",
      trade: "Civil",
      scope: "x",
      progressPercent: new Decimal("12.5"),
      contractValue: new Decimal("2310000"),
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: null,
      retentionPercent: new Decimal("5"),
      status: "ACTIVE",
    });
    expect(wo.contractValue).toBe("2310000.00");
    expect(wo.progressPercent).toBe("12.5000");
    expect(wo.startDate).toBe("2026-04-01");
    expect(wo.endDate).toBeNull();
    expect(wo.createdAt).toBe("2026-03-01T04:30:00.000Z");
  });

  it("maps bills and payments", () => {
    const bill = mapBill({
      ...b,
      workOrderId: "w",
      subcontractorId: "s",
      projectId: "p",
      regionId: "r",
      gstRegistrationId: "g",
      billNo: "B1",
      billDate: new Date("2026-05-31T00:00:00Z"),
      periodFrom: new Date("2026-05-01T00:00:00Z"),
      periodTo: new Date("2026-05-31T00:00:00Z"),
      grossAmount: new Decimal("100000"),
      gstAmount: new Decimal("18000"),
      totalDeductions: new Decimal("5000.5"),
      netPayable: new Decimal("112999.5"),
      paidAmount: new Decimal(0),
      status: "APPROVED",
      approvalRequestId: null,
    });
    expect(bill.netPayable).toBe("112999.50");
    expect(bill.paidAmount).toBe("0.00");
    const pay = mapPayment({
      ...b,
      direction: "OUT",
      purpose: "SUBCONTRACTOR",
      amount: new Decimal("50000"),
      paidOn: new Date("2026-06-02T00:00:00Z"),
      mode: "BANK_TRANSFER",
      utr: null,
      regionId: "r",
      projectId: "p",
      gstRegistrationId: null,
      partyId: "pt",
      organisationId: null,
      invoiceId: null,
      subcontractorBillId: "x1",
      vendorInvoiceId: null,
      securityInstrumentId: null,
      remarks: null,
    });
    expect(pay.amount).toBe("50000.00");
    expect(pay.paidOn).toBe("2026-06-02");
  });

  it("keeps soft-delete timestamps", () => {
    const p = mapParty({
      ...b,
      deletedAt: ts,
      name: "A",
      gstin: null,
      pan: "P",
      address: "a",
      stateId: "st",
      contactName: "c",
      phone: "1",
      email: null,
      isActive: true,
    });
    expect(p.deletedAt).toBe(ts.toISOString());
    expect(liveWhere()).toEqual({ deletedAt: null });
    expect(liveWhere({ includeDeleted: true })).toEqual({});
  });

  it("maps approvals", () => {
    const r = mapApprovalRequest({
      ...b,
      entityType: "SUB_BILL",
      entityId: "e",
      amount: new Decimal("999999.999"),
      regionId: "r",
      projectId: null,
      title: "t",
      requestedById: "u",
      status: "PENDING",
      currentSequence: 1,
      submittedAt: ts,
      completedAt: null,
    });
    expect(r.amount).toBe("1000000.00");
    expect(r.completedAt).toBeNull();
    expect(mapApprovalAction({ ...b, stepId: "s", actorId: "u", action: "APPROVE", comment: null, at: ts }).at).toBe(
      ts.toISOString(),
    );
    expect(mapApprovalThreshold({ ...b, flowId: "f", roleId: "r", maxAmount: new Decimal(1000000) }).maxAmount).toBe(
      "1000000.00",
    );
  });

  it("maps audit logs (bigint id, JOB actor, json)", () => {
    const a = mapAuditLog({
      id: BigInt(42),
      occurredAt: ts,
      createdAt: ts,
      actorId: null,
      actorType: "JOB",
      action: "UPDATE",
      entityType: "Tender",
      entityId: "t",
      regionId: null,
      projectId: null,
      summary: "s",
      before: { a: 1 },
      after: [1, 2],
      reason: null,
    });
    expect(a.id).toBe("42");
    expect(a.actorType).toBe("SYSTEM");
    expect(a.before).toEqual({ a: 1 });
    expect(a.after).toBeNull();
  });

  it("maps masters, notifications and settings", () => {
    expect(
      mapDeductionType({
        ...b,
        code: "TDS",
        name: "TDS",
        calcMethod: "PERCENT",
        defaultRate: new Decimal("2"),
        appliesTo: "BOTH",
        isReleasable: false,
      }).defaultRate,
    ).toBe("2.0000");
    expect(
      mapNotification({ ...b, userId: "u", type: "t", title: "x", body: null, entityType: null, entityId: null, readAt: null, dedupeKey: "k" })
        .dedupeKey,
    ).toBe("k");
    expect(mapSetting({ ...b, key: "k", value: { days: 7 }, regionId: null }).value).toEqual({ days: 7 });
    expect(isoDate(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });
});
