// Integration: add/edit projects and subcontractors against the dev/test DB through the real runAction.
// Skipped unless APP_ENV is development/test. Creates only its own rows (unique names) and removes exactly those at the end
// (audit rows via the guarded test hook app.allow_audit_reset, scoped to this run's ids).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/server/prisma";
import type { SessionUser } from "@/lib/server/auth-types";
import { buildProjectActions } from "@/modules/projects/service";
import { buildSubcontractorActions } from "@/modules/subcontractors/service";
import { makeGstin } from "@/lib/gst-validation";

const enabled = ["development", "test"].includes(process.env.APP_ENV ?? "") && !!process.env.DATABASE_URL;
vi.setConfig({ hookTimeout: 120000 });
const TX = { timeout: 60000, maxWait: 60000 };
const RUN = randomUUID().slice(0, 8);

const mkUser = (id: string, roleKeys: string[]): SessionUser => ({ id, authUserId: randomUUID(), email: `${id}@test.invalid`, name: id, roleKeys });

describe.runIf(enabled)("projects and subcontractors entry (dev DB)", { timeout: 120000 }, () => {
  const adminId = `t_psadmin_${RUN}`;
  const directorId = `t_psdir_${RUN}`;
  const admin = mkUser(adminId, ["system_admin"]);
  const director = mkUser(directorId, ["director"]);
  const adminP = buildProjectActions(async () => admin);
  const directorP = buildProjectActions(async () => director);
  const adminS = buildSubcontractorActions(async () => admin);
  const directorS = buildSubcontractorActions(async () => director);

  const projectIds: string[] = [];
  const subIds: string[] = [];
  const partyNames: string[] = [];
  let siteId = "";
  let serviceLineId = "";
  let stateId = "";
  let stateCode = "";

  beforeAll(async () => {
    const site = await prisma.site.findFirstOrThrow({ where: { deletedAt: null, region: { regionGstRegistrations: { some: { deletedAt: null } } } } });
    siteId = site.id;
    serviceLineId = (await prisma.serviceLine.findFirstOrThrow({ where: { isActive: true, deletedAt: null } })).id;
    const state = await prisma.state.findFirstOrThrow({ where: { deletedAt: null } });
    stateId = state.id;
    stateCode = state.gstStateCode;
    for (const id of [adminId, directorId]) {
      await prisma.user.create({ data: { id, name: `Test ${id}`, email: `${id}@test.invalid`, isActive: true } });
    }
  });

  afterAll(async () => {
    const subs = await prisma.subcontractor.findMany({ where: { party: { name: { contains: RUN } } }, select: { id: true, partyId: true } });
    const entityIds = [...projectIds, ...subIds, ...subs.map((s) => s.id)];
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('app.allow_audit_reset', 'on', true)`;
      await tx.auditLog.deleteMany({ where: { OR: [{ entityId: { in: entityIds } }, { actorId: { in: [adminId, directorId] } }] } });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
      await tx.subcontractor.deleteMany({ where: { id: { in: subs.map((s) => s.id) } } });
      await tx.party.deleteMany({ where: { id: { in: subs.map((s) => s.partyId) } } });
      await tx.user.deleteMany({ where: { id: { in: [adminId, directorId] } } });
    }, TX);
    await prisma.$disconnect();
  });

  const projectInput = (over: Record<string, string> = {}) => ({
    name: `Test project ${RUN}`, siteId, serviceLineId, contractType: "FIXED_SCOPE" as const, billingCycle: "MILESTONE" as const,
    contractValue: "5000000", startDate: "01-04-2031", plannedEndDate: "31-03-2032", ...over,
  });

  it("the Director cannot add a project; the Admin can, and it is audited", async () => {
    const denied = await directorP.createProject(projectInput());
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("FORBIDDEN");

    const res = await adminP.createProject(projectInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    projectIds.push(res.data.id);
    const row = await prisma.project.findUniqueOrThrow({ where: { id: res.data.id } });
    expect(row.name).toBe(`Test project ${RUN}`);
    expect(row.contractValue.toFixed(2)).toBe("5000000.00");
    expect(row.code).toMatch(/^SPH-/);
    const audit = await prisma.auditLog.findMany({ where: { entityId: row.id, action: "project.create" } });
    expect(audit).toHaveLength(1);
  });

  it("rejects bad input with field errors", async () => {
    const res = await adminP.createProject(projectInput({ contractValue: "0", plannedEndDate: "01-01-2031" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION");
  });

  it("editing the contract value needs a reason and honours the version", async () => {
    const id = projectIds[0];
    const row = await prisma.project.findUniqueOrThrow({ where: { id } });
    const edit = { ...projectInput({ contractValue: "6000000" }), id, version: row.version };

    const noReason = await adminP.updateProject(edit);
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.error.code).toBe("REASON_REQUIRED");

    const ok = await adminP.updateProject({ ...edit, reason: "Variation order" });
    expect(ok.ok).toBe(true);
    expect((await prisma.project.findUniqueOrThrow({ where: { id } })).contractValue.toFixed(2)).toBe("6000000.00");

    const stale = await adminP.updateProject({ ...edit, reason: "Again" });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("CONFLICT");
  });

  const subInput = (over: Record<string, string> = {}) => ({
    name: `Test sub ${RUN}`, contactName: "A Person", phone: "9876543210", pan: "ABCPD1234E", stateId, tradeCategory: "Civil", ...over,
  });

  it("the Director cannot add a subcontractor; the Admin can, and duplicates are refused", async () => {
    const denied = await directorS.createSubcontractor(subInput());
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("FORBIDDEN");

    const res = await adminS.createSubcontractor(subInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    subIds.push(res.data.id);
    partyNames.push(res.data.name);
    expect(await prisma.auditLog.count({ where: { entityId: res.data.id, action: "subcontractor.create" } })).toBe(1);

    const dup = await adminS.createSubcontractor(subInput());
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe("CONFLICT");
  });

  it("validates PAN and GSTIN, and edits with the version", async () => {
    const badPan = await adminS.createSubcontractor(subInput({ name: `Test sub2 ${RUN}`, pan: "12345" }));
    expect(badPan.ok).toBe(false);
    if (!badPan.ok) expect(badPan.error.code).toBe("VALIDATION");

    const gstin = makeGstin(stateCode, "ABCPD1234E");
    const sub = await prisma.subcontractor.findUniqueOrThrow({ where: { id: subIds[0] } });
    const ok = await adminS.updateSubcontractor({ ...subInput({ gstin, tradeCategory: "Painting" }), id: sub.id, version: sub.version, status: "ACTIVE" });
    expect(ok.ok).toBe(true);
    const after = await prisma.subcontractor.findUniqueOrThrow({ where: { id: sub.id }, include: { party: true } });
    expect(after.tradeCategory).toBe("Painting");
    expect(after.party.gstin).toBe(gstin);

    const stale = await adminS.updateSubcontractor({ ...subInput(), id: sub.id, version: sub.version, status: "ACTIVE" });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("CONFLICT");
  });
});
