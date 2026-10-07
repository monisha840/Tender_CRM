// Integration: permissions, audit and the approval engine against the dev/test database.
// Skipped unless APP_ENV is development/test. Creates only rows of its own (unique ids) and removes exactly those at
// the end. Audit rows are append-only (DB trigger); the cleanup uses the guarded test hook (app.allow_audit_reset) for
// rows whose entityId is one of this run's ids, never anything else.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/server/prisma";
import { AuthError, type SessionUser } from "@/lib/server/auth-types";
import { assertCan, can, scopeFilter } from "@/lib/server/permissions";
import { requireReason, writeAudit } from "@/lib/server/audit";
import { runAction, updateWithVersion } from "@/lib/server/service";
import { decide, registerApprovalHandler, submitForApproval, unregisterApprovalHandler } from "@/modules/approvals/service";

const enabled = ["development", "test"].includes(process.env.APP_ENV ?? "") && !!process.env.DATABASE_URL;
vi.setConfig({ hookTimeout: 90000 });
const TX = { timeout: 30000, maxWait: 30000 };
const RUN = randomUUID().slice(0, 8);
const ENTITY = `TEST_ENTITY_${RUN}`;

const mkUser = (id: string, roleKeys: string[]): SessionUser => ({ id, authUserId: randomUUID(), email: `${id}@test.invalid`, name: id, roleKeys });

// The dev DB is remote: allow generous time per test (each does several round trips).
describe.runIf(enabled)("permissions, audit, approvals (dev DB)", { timeout: 90000 }, () => {
  const adminId = `t_admin_${RUN}`;
  const directorId = `t_dir_${RUN}`;
  const otherDirectorId = `t_dir2_${RUN}`;
  const testRoleKey = `t_role_${RUN}`;
  const testRoleId = `role_${testRoleKey}`;
  const entityIds: string[] = [];
  const requestIds: string[] = [];
  const admin = mkUser(adminId, ["system_admin"]);
  const director = mkUser(directorId, ["director"]);
  const otherDirector = mkUser(otherDirectorId, ["director"]);
  /** Holds approvals:VIEW so it can run actions that submit (the real matrix differs between seeds). */
  const maker = mkUser(adminId, [testRoleKey]);
  const approved: string[] = [];
  const rejected: string[] = [];
  let regionId = "";

  const newEntity = () => {
    const id = `ent_${RUN}_${entityIds.length}`;
    entityIds.push(id);
    return id;
  };

  beforeAll(async () => {
    const [dirRole] = await Promise.all([prisma.role.findUniqueOrThrow({ where: { key: "director" } })]);
    regionId = (await prisma.region.findFirstOrThrow({ where: { isActive: true } })).id;
    for (const [id, name] of [[adminId, "A"], [directorId, "D"], [otherDirectorId, "D2"]] as const) {
      await prisma.user.create({ data: { id, name: `Test ${name} ${RUN}`, email: `${id}@test.invalid`, isActive: true } });
    }
    await prisma.userRole.createMany({
      data: [directorId, otherDirectorId].map((u) => ({ id: `ur_${u}`, userId: u, roleId: dirRole.id })),
    });
    // A private role granting approvals:VIEW and tenders:CREATE+VIEW, independent of the seeded matrix.
    await prisma.role.create({ data: { id: testRoleId, key: testRoleKey, name: `Test ${RUN}`, description: "test", isSystem: false } });
    const perms = await prisma.permission.findMany({
      where: { OR: [{ module: "approvals", action: "VIEW" }, { module: "tenders", action: "CREATE" }, { module: "tenders", action: "VIEW" }] },
    });
    await prisma.rolePermission.createMany({ data: perms.map((p) => ({ id: `rp_${testRoleKey}_${p.id}`, roleId: testRoleId, permissionId: p.id })) });

    registerApprovalHandler(ENTITY, {
      onApproved: async (_tx, ctx) => void approved.push(ctx.request.entityId),
      onRejected: async (_tx, ctx) => void rejected.push(ctx.request.entityId),
    });
  });

  afterAll(async () => {
    unregisterApprovalHandler(ENTITY);
    const ids = [...entityIds, ...requestIds];
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('app.allow_audit_reset', 'on', true)`;
      await tx.auditLog.deleteMany({ where: { OR: [{ entityId: { in: ids } }, { approvalRequestId: { in: requestIds } }, { actorId: { in: [adminId, directorId, otherDirectorId] } }] } });
      const steps = await tx.approvalStep.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } });
      await tx.approvalAction.deleteMany({ where: { stepId: { in: steps.map((s) => s.id) } } });
      await tx.approvalStep.deleteMany({ where: { requestId: { in: requestIds } } });
      await tx.notification.deleteMany({ where: { OR: [{ entityId: { in: requestIds } }, { userId: { in: [adminId, directorId, otherDirectorId] } }] } });
      await tx.approvalRequest.deleteMany({ where: { id: { in: requestIds } } });
      await tx.rolePermission.deleteMany({ where: { roleId: testRoleId } });
      await tx.userRole.deleteMany({ where: { userId: { in: [adminId, directorId, otherDirectorId] } } });
      await tx.role.deleteMany({ where: { id: testRoleId } });
      await tx.user.deleteMany({ where: { id: { in: [adminId, directorId, otherDirectorId] } } });
    }, TX);
    await prisma.$disconnect();
  });

  /** Submits as the maker through runAction so permission + audit are exercised. */
  const submit = async (amount?: string) => {
    const entityId = newEntity();
    const action = runAction(
      { schema: z.object({ entityId: z.string() }), module: "approvals", action: "VIEW", getUser: async () => maker },
      async ({ tx, user, input }) => {
        const req = await submitForApproval(tx, user, { flowKey: "GO_NO_GO", entityType: ENTITY, entityId: input.entityId, summary: `Test ${input.entityId}`, amount, regionId });
        requestIds.push(req.id);
        return req;
      },
    );
    const res = await action({ entityId });
    if (!res.ok) throw new Error(`submit failed: ${JSON.stringify(res.error)}`);
    return { entityId, request: res.data };
  };

  const auditFor = (entityId: string) => prisma.auditLog.findMany({ where: { entityId }, orderBy: { id: "asc" } });

  it("can/assertCan read the matrix from the DB; scopeFilter is unrestricted", async () => {
    expect(await can(director, "approvals", "APPROVE")).toBe(true);
    expect(await can(admin, "approvals", "APPROVE")).toBe(false);
    await expect(assertCan(admin, "approvals", "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assertCan(director, "approvals", "REJECT")).resolves.toBeUndefined();
    expect(await can(mkUser("x", []), "tenders", "VIEW")).toBe(false);
    expect(scopeFilter(director, "tenders")).toEqual({});
  });

  it("submit creates a request with one Director step, notifies other directors, and audits", async () => {
    const { entityId, request } = await submit("250000.00");
    const steps = await prisma.approvalStep.findMany({ where: { requestId: request.id } });
    expect(steps).toHaveLength(1);
    expect(request.status).toBe("PENDING");
    const note = await prisma.notification.findMany({ where: { entityId: request.id } });
    expect(note.map((n) => n.userId).sort()).toEqual(expect.arrayContaining([directorId, otherDirectorId]));
    const audit = await auditFor(entityId);
    expect(audit.map((a) => a.action)).toEqual(["approval.submit"]);
    expect(audit[0].actorId).toBe(adminId);
  });

  it("a duplicate pending request for the same record is rejected", async () => {
    const { entityId } = await submit();
    await expect(
      prisma.$transaction((tx) => submitForApproval(tx, maker, { flowKey: "GO_NO_GO", entityType: ENTITY, entityId, summary: "dup", regionId }), TX),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("a Director can approve: handler runs, status APPROVED, action + audit written, requester notified", async () => {
    const { entityId, request } = await submit();
    const res = await decide(director, { requestId: request.id, decision: "APPROVE" });
    expect(res.status).toBe("APPROVED");
    expect(approved).toContain(entityId);
    const row = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id }, include: { steps: { include: { actions: true } } } });
    expect(row.status).toBe("APPROVED");
    expect(row.completedAt).not.toBeNull();
    expect(row.steps[0].actions.map((a) => a.action)).toEqual(["APPROVE"]);
    expect((await auditFor(entityId)).map((a) => a.action)).toEqual(["approval.submit", "approval.approve"]);
    expect(await prisma.notification.count({ where: { userId: adminId, entityId: request.id, type: "APPROVAL_DECIDED" } })).toBe(1);
  });

  it("the Admin cannot approve (FORBIDDEN) and the request stays pending", async () => {
    const { request } = await submit();
    await expect(decide(admin, { requestId: request.id, decision: "APPROVE" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("PENDING");
  });

  it("maker-checker: the requester can never decide their own request, even as Director", async () => {
    const entityId = newEntity();
    const req = await prisma.$transaction((tx) => submitForApproval(tx, director, { flowKey: "GO_NO_GO", entityType: ENTITY, entityId, summary: "self", regionId }), TX);
    requestIds.push(req.id);
    const err = await decide(director, { requestId: req.id, decision: "APPROVE" }).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe("SELF_APPROVAL");
    // another Director can
    await expect(decide(otherDirector, { requestId: req.id, decision: "APPROVE" })).resolves.toMatchObject({ status: "APPROVED" });
  });

  it("reject needs a reason; with one it rejects, calls onRejected and audits the reason", async () => {
    const { entityId, request } = await submit();
    await expect(decide(director, { requestId: request.id, decision: "REJECT" })).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await expect(decide(director, { requestId: request.id, decision: "REJECT", reason: "   " })).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("PENDING");

    await decide(director, { requestId: request.id, decision: "REJECT", reason: "Margin too thin" });
    expect(rejected).toContain(entityId);
    const last = (await auditFor(entityId)).at(-1)!;
    expect(last.action).toBe("approval.reject");
    expect(last.reason).toBe("Margin too thin");
    await expect(decide(director, { requestId: request.id, decision: "APPROVE" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("a handler failure rolls the whole decision back", async () => {
    const type = `${ENTITY}_FAIL`;
    registerApprovalHandler(type, { onApproved: async () => { throw new Error("boom"); }, onRejected: async () => {} });
    const entityId = newEntity();
    const req = await prisma.$transaction((tx) => submitForApproval(tx, maker, { flowKey: "GO_NO_GO", entityType: type, entityId, summary: "fail", regionId }), TX);
    requestIds.push(req.id);
    await expect(decide(director, { requestId: req.id, decision: "APPROVE" })).rejects.toThrow("boom");
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PENDING");
    expect((await auditFor(entityId)).map((a) => a.action)).toEqual(["approval.submit"]);
    unregisterApprovalHandler(type);
  });

  it("runAction: validates, checks permission, audits every write, and rolls back when a handler writes no audit", async () => {
    const schema = z.object({ note: z.string().min(3) });
    const entityId = newEntity();
    const ok = runAction({ schema, module: "tenders", action: "CREATE", getUser: async () => maker }, async ({ input, audit }) => {
      await audit({ action: "test.create", entityType: ENTITY, entityId, after: { note: input.note } });
      return { saved: true };
    });
    expect(await ok({ note: "hello" })).toEqual({ ok: true, data: { saved: true } });
    const rows = await auditFor(entityId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: adminId, action: "test.create" });

    expect(await ok({ note: "x" })).toMatchObject({ ok: false, error: { code: "VALIDATION" } });

    const denied = runAction({ schema, module: "tenders", action: "DELETE", getUser: async () => maker }, async () => 1);
    expect(await denied({ note: "hello" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    const noAudit = runAction({ schema, module: "tenders", action: "CREATE", getUser: async () => maker }, async () => 1);
    expect((await noAudit({ note: "hello" })).ok).toBe(false);

    const needReason = runAction({ schema: schema.extend({ reason: z.string().optional() }), module: "tenders", action: "CREATE", reasonRequired: true, getUser: async () => maker }, async () => 1);
    expect(await needReason({ note: "hello" })).toMatchObject({ ok: false, error: { code: "REASON_REQUIRED" } });
  });

  it("writeAudit requires a reason for amount changes and approval/result actions", async () => {
    const entityId = newEntity();
    await expect(
      prisma.$transaction((tx) => writeAudit(tx, { user: admin, action: "tender.update", entityType: ENTITY, entityId, before: { estimatedValue: "1" }, after: { estimatedValue: "2" } })),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await expect(
      prisma.$transaction((tx) => writeAudit(tx, { user: admin, action: "tender.result", entityType: ENTITY, entityId, after: { result: "WON" } })),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await prisma.$transaction((tx) => writeAudit(tx, { user: admin, action: "tender.update", entityType: ENTITY, entityId, before: { title: "a" }, after: { title: "b" } }));
    await prisma.$transaction((tx) =>
      writeAudit(tx, { user: admin, action: "tender.update", entityType: ENTITY, entityId, before: { estimatedValue: "1" }, after: { estimatedValue: "2" }, reason: "Corrected per corrigendum" }),
    );
    expect((await auditFor(entityId)).map((a) => a.changedFields)).toEqual([["title"], ["estimatedValue"]]);
    expect(() => requireReason(" ")).toThrow(AuthError);
  });

  it("audit rows cannot be updated or deleted by app code (trigger)", async () => {
    const entityId = newEntity();
    await prisma.$transaction((tx) => writeAudit(tx, { user: admin, action: "test.create", entityType: ENTITY, entityId }));
    const row = (await auditFor(entityId))[0];
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { summary: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    expect((await auditFor(entityId))[0].summary).toBe(row.summary);
    const steps = await prisma.approvalAction.findFirst({ where: { stepId: { in: (await prisma.approvalStep.findMany({ where: { requestId: { in: requestIds } }, select: { id: true } })).map((s) => s.id) } } });
    if (steps) await expect(prisma.approvalAction.delete({ where: { id: steps.id } })).rejects.toThrow(/append-only/);
  });

  it("updateWithVersion enforces optimistic locking", async () => {
    const id = `t_ver_${RUN}`;
    await prisma.user.create({ data: { id, name: "ver", email: `${id}@test.invalid` } });
    try {
      await updateWithVersion(prisma.user, id, 1, { name: "v2" });
      await expect(updateWithVersion(prisma.user, id, 1, { name: "stale" })).rejects.toMatchObject({ code: "CONFLICT" });
      const row = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ name: "v2", version: 2 });
    } finally {
      await prisma.user.delete({ where: { id } });
    }
  });
});
