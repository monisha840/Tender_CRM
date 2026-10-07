// Integration: tender lifecycle against the dev/test DB through the real runAction + approval engine.
// Skipped unless APP_ENV is development/test. Creates only its own rows (unique tender numbers / test users) and removes
// exactly those at the end (audit rows via the guarded test hook app.allow_audit_reset, scoped to this run's ids).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/server/prisma";
import type { SessionUser } from "@/lib/server/auth-types";
import { buildTenderActions } from "@/modules/tenders/service";
import { buildApprovalActions } from "@/modules/approvals/decide-action";

const enabled = ["development", "test"].includes(process.env.APP_ENV ?? "") && !!process.env.DATABASE_URL;
vi.setConfig({ hookTimeout: 120000 });
const TX = { timeout: 60000, maxWait: 60000 };
const RUN = randomUUID().slice(0, 8);

const mkUser = (id: string, roleKeys: string[]): SessionUser => ({ id, authUserId: randomUUID(), email: `${id}@test.invalid`, name: id, roleKeys });

describe.runIf(enabled)("tenders end to end (dev DB)", { timeout: 120000 }, () => {
  const adminId = `t_tadmin_${RUN}`;
  const directorId = `t_tdir_${RUN}`;
  const admin = mkUser(adminId, ["system_admin"]);
  const director = mkUser(directorId, ["director"]);
  const adminA = buildTenderActions(async () => admin);
  const directorA = buildTenderActions(async () => director);
  const adminApprovals = buildApprovalActions(async () => admin);
  const directorApprovals = buildApprovalActions(async () => director);

  const tenderNo = `T-${RUN}/NIT/101`;
  const base = { tenderNo, title: `Test tender ${RUN}`, location: "Test plant", estimatedValue: "5000000", emdAmount: "100000", tenderFee: "5000", submissionDeadline: "31-12-2030 15:00", openingDate: "01-01-2031" } as const;
  let masters: { organisationId: string; serviceLineId: string; regionId: string; tenderTypeId: string };
  let tenderId = "";
  const requestIds: string[] = [];
  const projectIds: string[] = [];

  const reload = () => prisma.tender.findUniqueOrThrow({ where: { id: tenderId }, include: { currentStage: true } });

  beforeAll(async () => {
    // A region/organisation pair that has a plant site and a GSTIN, so conversion can run.
    const site = await prisma.site.findFirstOrThrow({ where: { deletedAt: null, region: { regionGstRegistrations: { some: { deletedAt: null } } } } });
    masters = {
      organisationId: site.organisationId,
      regionId: site.regionId,
      serviceLineId: (await prisma.serviceLine.findFirstOrThrow({ where: { isActive: true, deletedAt: null } })).id,
      tenderTypeId: (await prisma.tenderType.findFirstOrThrow({ where: { isActive: true, deletedAt: null } })).id,
    };
    for (const id of [adminId, directorId]) {
      await prisma.user.create({ data: { id, name: `Test ${id}`, email: `${id}@test.invalid`, isActive: true } });
    }
  });

  afterAll(async () => {
    const tenders = await prisma.tender.findMany({ where: { tenderNo: { contains: RUN } }, select: { id: true } });
    const tids = tenders.map((t) => t.id);
    const entityIds = [...tids, ...projectIds, ...requestIds];
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('app.allow_audit_reset', 'on', true)`;
      await tx.auditLog.deleteMany({ where: { OR: [{ entityId: { in: entityIds } }, { approvalRequestId: { in: requestIds } }, { actorId: { in: [adminId, directorId] } }] } });
      const steps = await tx.approvalStep.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } });
      await tx.approvalAction.deleteMany({ where: { stepId: { in: steps.map((s) => s.id) } } });
      await tx.projectConversion.deleteMany({ where: { tenderId: { in: tids } } });
      await tx.goNoGoDecision.deleteMany({ where: { tenderId: { in: tids } } });
      await tx.approvalStep.deleteMany({ where: { requestId: { in: requestIds } } });
      await tx.approvalRequest.deleteMany({ where: { id: { in: requestIds } } });
      await tx.notification.deleteMany({ where: { OR: [{ entityId: { in: requestIds } }, { userId: { in: [adminId, directorId] } }] } });
      await tx.project.deleteMany({ where: { OR: [{ id: { in: projectIds } }, { tenderId: { in: tids } }] } });
      await tx.tenderStageHistory.deleteMany({ where: { tenderId: { in: tids } } });
      await tx.tender.deleteMany({ where: { id: { in: tids } } });
      await tx.user.deleteMany({ where: { id: { in: [adminId, directorId] } } });
    }, TX);
    await prisma.$disconnect();
  });

  it("rejects invalid input with field errors", async () => {
    const res = await adminA.createTender({ ...base, ...masters, title: "", submissionDeadline: "32-13-2030" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("VALIDATION");
      expect(res.error.fieldErrors).toHaveProperty("title");
      expect(res.error.fieldErrors).toHaveProperty("submissionDeadline");
    }
  });

  it("Director cannot create tenders (no CREATE grant)", async () => {
    const res = await directorA.createTender({ ...base, ...masters });
    expect(res).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("creates a tender in the first open stage with history and audit; duplicate tenderNo is rejected", async () => {
    const res = await adminA.createTender({ ...base, ...masters });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    tenderId = res.data.id;
    const t = await reload();
    expect(t.currentStage.systemKey).toBe("NEW");
    expect(t.estimatedValue.toFixed(2)).toBe("5000000.00");
    expect(t.gstRegistrationId).not.toBeNull();
    expect(await prisma.tenderStageHistory.count({ where: { tenderId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: tenderId, action: "tender.create" } })).toBe(1);

    const dup = await adminA.createTender({ ...base, ...masters, tenderNo: tenderNo.toLowerCase() });
    expect(dup).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    if (!dup.ok) expect(dup.error.message).toMatch(/already exists/);
  });

  it("update uses the version; a stale version conflicts; an amount change needs a reason", async () => {
    const t = await reload();
    const noReason = await adminA.updateTender({ ...base, ...masters, id: tenderId, version: t.version, estimatedValue: "6000000" });
    expect(noReason).toMatchObject({ ok: false, error: { code: "REASON_REQUIRED" } });
    const ok = await adminA.updateTender({ ...base, ...masters, id: tenderId, version: t.version, estimatedValue: "6000000", reason: "Corrigendum raised the estimate" });
    expect(ok.ok).toBe(true);
    const stale = await adminA.updateTender({ ...base, ...masters, id: tenderId, version: t.version, title: "Changed" });
    expect(stale).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("stage moves follow the configured list; GO/NO-GO is required to leave Under Evaluation", async () => {
    const stages = await prisma.tenderStage.findMany({ where: { kind: "OPEN", isActive: true }, orderBy: { sequence: "asc" } });
    const byKey = (k: string) => stages.find((s) => s.systemKey === k)!;
    let t = await reload();
    const skip = await adminA.moveStage({ id: tenderId, toStageId: byKey("BID_PREPARING").id, version: t.version });
    expect(skip).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    const m1 = await adminA.moveStage({ id: tenderId, toStageId: byKey("UNDER_EVALUATION").id, version: t.version });
    expect(m1.ok).toBe(true);
    t = await reload();
    const blocked = await adminA.moveStage({ id: tenderId, toStageId: byKey("BID_PREPARING").id, version: t.version });
    expect(blocked).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    const back = await adminA.moveStage({ id: tenderId, toStageId: byKey("NEW").id, version: t.version });
    expect(back).toMatchObject({ ok: false, error: { code: "VALIDATION" } }); // reason needed
  });

  it("NO-GO needs a reason; Admin requests GO; Admin cannot decide; Director approves", async () => {
    const noReason = await adminA.requestGoNoGo({ id: tenderId, recommendation: "NO_GO" });
    expect(noReason).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    const nonAdmin = await directorA.requestGoNoGo({ id: tenderId, recommendation: "GO" });
    expect(nonAdmin).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    const req = await adminA.requestGoNoGo({ id: tenderId, recommendation: "GO", reason: "Eligibility met" });
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    requestIds.push(req.data.requestId);
    const again = await adminA.requestGoNoGo({ id: tenderId, recommendation: "GO" });
    expect(again).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    const adminTry = await adminApprovals.decide({ requestId: req.data.requestId, decision: "APPROVE" });
    expect(adminTry).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: req.data.requestId } })).status).toBe("PENDING");

    const done = await directorApprovals.decide({ requestId: req.data.requestId, decision: "APPROVE" });
    expect(done).toMatchObject({ ok: true, data: { status: "APPROVED" } });
    const t = await reload();
    expect(t.currentStage.systemKey).toBe("BID_PREPARING");
    const dec = await prisma.goNoGoDecision.findFirstOrThrow({ where: { tenderId } });
    expect(dec).toMatchObject({ decision: "GO", decidedById: directorId, approvalRequestId: req.data.requestId });
    expect(await prisma.tenderStageHistory.count({ where: { tenderId } })).toBe(3);
    expect(await prisma.auditLog.count({ where: { approvalRequestId: req.data.requestId, action: "approval.approve" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: tenderId, action: "tender.go_nogo.decided" } })).toBe(1);
  });

  it("result needs a reason and a Submitted tender; then won", async () => {
    const stages = await prisma.tenderStage.findMany({ where: { isActive: true } });
    const submitted = stages.find((s) => s.systemKey === "SUBMITTED")!;
    let t = await reload();
    const early = await adminA.markWon({ id: tenderId, version: t.version, reason: "Awarded" });
    expect(early).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect((await adminA.moveStage({ id: tenderId, toStageId: submitted.id, version: t.version })).ok).toBe(true);
    t = await reload();
    const noReason = await adminA.markWon({ id: tenderId, version: t.version, reason: "" });
    expect(noReason).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    const won = await adminA.markWon({ id: tenderId, version: t.version, reason: "L1 and awarded by NTPC" });
    expect(won.ok).toBe(true);
    t = await reload();
    expect(t.currentStage.kind).toBe("WON");
    expect(t.resultId).not.toBeNull();
    expect((await prisma.auditLog.findFirstOrThrow({ where: { entityId: tenderId, action: "tender.result" } })).reason).toBe("L1 and awarded by NTPC");
  });

  it("conversion: Admin requests, Director approves, project exists with carried-over data", async () => {
    const early = await directorA.requestConversion({ id: tenderId });
    expect(early).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const req = await adminA.requestConversion({ id: tenderId });
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    requestIds.push(req.data.requestId);
    expect(await adminA.requestConversion({ id: tenderId })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await prisma.project.findFirst({ where: { tenderId } })).toBeNull();

    expect(await adminApprovals.decide({ requestId: req.data.requestId, decision: "APPROVE" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const done = await directorApprovals.decide({ requestId: req.data.requestId, decision: "APPROVE" });
    expect(done).toMatchObject({ ok: true, data: { status: "APPROVED" } });

    const t = await reload();
    const p = await prisma.project.findFirstOrThrow({ where: { tenderId, deletedAt: null } });
    projectIds.push(p.id);
    expect(p).toMatchObject({ organisationId: t.organisationId, regionId: t.regionId, gstRegistrationId: t.gstRegistrationId, name: t.title });
    expect(p.contractValue.toFixed(2)).toBe("6000000.00");
    expect(p.code).toMatch(/^SPH-/);
    expect(await prisma.projectConversion.count({ where: { tenderId, projectId: p.id, approvalRequestId: req.data.requestId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: p.id, action: "project.create" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: tenderId, action: "tender.convert" } })).toBe(1);

    // Already converted: cannot request again or be edited/deleted.
    expect(await adminA.requestConversion({ id: tenderId })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    const del = await adminA.deleteTender({ id: tenderId, version: t.version, reason: "Test delete" });
    expect(del).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("reject needs a reason and leaves the tender unchanged; soft delete hides the tender", async () => {
    const noGoNo = `${tenderNo}-B`;
    const c = await adminA.createTender({ ...base, ...masters, tenderNo: noGoNo });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const stage = await prisma.tenderStage.findFirstOrThrow({ where: { systemKey: "UNDER_EVALUATION" } });
    let t = await prisma.tender.findUniqueOrThrow({ where: { id: c.data.id } });
    expect((await adminA.moveStage({ id: t.id, toStageId: stage.id, version: t.version })).ok).toBe(true);
    const req = await adminA.requestGoNoGo({ id: t.id, recommendation: "GO" });
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    requestIds.push(req.data.requestId);
    expect(await directorApprovals.decide({ requestId: req.data.requestId, decision: "REJECT" })).toMatchObject({ ok: false, error: { code: "REASON_REQUIRED" } });
    expect(await directorApprovals.decide({ requestId: req.data.requestId, decision: "REJECT", reason: "Capacity not available" })).toMatchObject({ ok: true, data: { status: "REJECTED" } });
    t = await prisma.tender.findUniqueOrThrow({ where: { id: c.data.id } });
    expect(t.currentStageId).toBe(stage.id);
    expect(await prisma.goNoGoDecision.count({ where: { tenderId: t.id } })).toBe(0);

    const del = await adminA.deleteTender({ id: t.id, version: t.version, reason: "Entered by mistake" });
    expect(del.ok).toBe(true);
    expect((await prisma.tender.findUniqueOrThrow({ where: { id: t.id } })).deletedAt).not.toBeNull();
    // The deleted number can be used again.
    const again = await adminA.createTender({ ...base, ...masters, tenderNo: noGoNo });
    expect(again.ok).toBe(true);
  });
});
