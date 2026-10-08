// Server-only: never import from client components.
import type { Prisma } from "@prisma/client";
import { addDays, toIstDate } from "@/lib/dates";
import { type Tx } from "@/lib/server/audit";
import { runAction, ServiceError, updateWithVersion, type UserResolver } from "@/lib/server/service";
import { createProjectSchema, updateProjectSchema } from "./schema";

/**
 * Project entry (add / edit). Every write runs in `runAction`: permission, one transaction, audit entry.
 * Projects that come from a tender are created by the tender conversion; this is for work orders entered directly.
 */

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const todayIst = () => toIstDate(new Date().toISOString());
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

type ProjectRow = Prisma.ProjectGetPayload<object>;

const projectSnapshot = (p: ProjectRow) => ({
  code: p.code, name: p.name, serviceLineId: p.serviceLineId, siteId: p.siteId, contractType: p.contractType, billingCycle: p.billingCycle,
  workOrderNo: p.workOrderNo, workOrderDate: iso(p.workOrderDate), paymentTermsDays: p.paymentTermsDays, organisationId: p.organisationId,
  regionId: p.regionId, gstRegistrationId: p.gstRegistrationId, contractValue: p.contractValue.toFixed(2), startDate: iso(p.startDate),
  plannedEndDate: iso(p.plannedEndDate), statusId: p.statusId, projectManagerId: p.projectManagerId,
});

async function nextProjectCode(tx: Tx, regionId: string): Promise<string> {
  const region = await tx.region.findUnique({ where: { id: regionId }, select: { code: true } });
  const prefix = `SPH-${region?.code ?? "GEN"}-`;
  const rows = await tx.project.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } }); // deleted included
  let n = 0;
  for (const r of rows) {
    const m = /^\d+$/.exec(r.code.slice(prefix.length));
    if (m) n = Math.max(n, Number(m[0]));
  }
  return `${prefix}${String(n + 1).padStart(2, "0")}`;
}

/** Resolves the site (customer + region), GSTIN, status and manager, or fails with a message for the form. */
async function resolveMasters(tx: Tx, v: { siteId: string; serviceLineId: string; gstRegistrationId: string; statusId: string; projectManagerId: string }) {
  const site = await tx.site.findFirst({ where: { id: v.siteId, deletedAt: null } });
  if (!site) throw new ServiceError("VALIDATION", "Plant site not found");
  const line = await tx.serviceLine.findFirst({ where: { id: v.serviceLineId, isActive: true, deletedAt: null }, select: { id: true } });
  if (!line) throw new ServiceError("VALIDATION", "Service line not found");

  let gstRegistrationId = v.gstRegistrationId;
  if (gstRegistrationId) {
    if (!(await tx.gstRegistration.findFirst({ where: { id: gstRegistrationId, deletedAt: null }, select: { id: true } }))) {
      throw new ServiceError("VALIDATION", "GSTIN not found");
    }
  } else {
    const link = await tx.regionGstRegistration.findFirst({ where: { regionId: site.regionId, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { id: "asc" }] });
    if (!link) throw new ServiceError("VALIDATION", "No GSTIN is set up for this site's region. Choose one.");
    gstRegistrationId = link.gstRegistrationId;
  }

  let statusId = v.statusId;
  if (statusId) {
    if (!(await tx.projectStatus.findFirst({ where: { id: statusId, isActive: true, deletedAt: null }, select: { id: true } }))) {
      throw new ServiceError("VALIDATION", "Status not found");
    }
  } else {
    const active = await tx.projectStatus.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { sequence: "asc" } });
    statusId = (active.find((s) => s.systemKey === "IN_PROGRESS") ?? active[0])?.id ?? "";
    if (!statusId) throw new ServiceError("VALIDATION", "No project status is configured");
  }

  if (v.projectManagerId && !(await tx.employee.findFirst({ where: { id: v.projectManagerId, deletedAt: null }, select: { id: true } }))) {
    throw new ServiceError("VALIDATION", "Project manager not found");
  }
  return { site, gstRegistrationId, statusId, projectManagerId: v.projectManagerId || null };
}

export function buildProjectActions(getUser?: UserResolver) {
  const createProject = runAction({ schema: createProjectSchema, module: "projects", action: "CREATE", getUser }, async ({ tx, user, input, audit }) => {
    const m = await resolveMasters(tx, input);
    const code = await nextProjectCode(tx, m.site.regionId);
    const today = todayIst();
    const startDate = input.startDate ?? today;
    const project = await tx.project.create({
      data: {
        code, name: input.name, serviceLineId: input.serviceLineId, siteId: m.site.id, contractType: input.contractType,
        workOrderNo: input.workOrderNo || `WO-${code}`, workOrderDate: dateOnly(input.workOrderDate ?? today), billingCycle: input.billingCycle,
        paymentTermsDays: input.paymentTermsDays, organisationId: m.site.organisationId, regionId: m.site.regionId,
        gstRegistrationId: m.gstRegistrationId, contractValue: input.contractValue, startDate: dateOnly(startDate),
        plannedEndDate: dateOnly(input.plannedEndDate ?? addDays(startDate, 365)), statusId: m.statusId,
        projectManagerId: m.projectManagerId, createdById: user.id,
      },
    });
    await audit({
      action: "project.create", entityType: "Project", entityId: project.id, regionId: project.regionId, projectId: project.id,
      after: projectSnapshot(project), summary: `Added project ${project.code} (${project.name})`,
    });
    return { id: project.id, code: project.code };
  });

  const updateProject = runAction({ schema: updateProjectSchema, module: "projects", action: "EDIT", getUser }, async ({ tx, user, input, audit }) => {
    const before = await tx.project.findFirst({ where: { id: input.id, deletedAt: null } });
    if (!before) throw new ServiceError("NOT_FOUND", "Project not found. It may have been removed.");
    const m = await resolveMasters(tx, input);
    const startDate = input.startDate ?? iso(before.startDate);
    await updateWithVersion(tx.project, before.id, input.version, {
      name: input.name, serviceLineId: input.serviceLineId, siteId: m.site.id, contractType: input.contractType, billingCycle: input.billingCycle,
      workOrderNo: input.workOrderNo || before.workOrderNo, workOrderDate: input.workOrderDate ? dateOnly(input.workOrderDate) : before.workOrderDate,
      paymentTermsDays: input.paymentTermsDays, organisationId: m.site.organisationId, regionId: m.site.regionId,
      gstRegistrationId: m.gstRegistrationId, contractValue: input.contractValue,
      startDate: startDate ? dateOnly(startDate) : null,
      plannedEndDate: input.plannedEndDate ? dateOnly(input.plannedEndDate) : before.plannedEndDate,
      statusId: m.statusId, projectManagerId: m.projectManagerId, updatedById: user.id,
    });
    const after = await tx.project.findUniqueOrThrow({ where: { id: before.id } });
    await audit({
      action: "project.update", entityType: "Project", entityId: before.id, regionId: after.regionId, projectId: after.id,
      before: projectSnapshot(before), after: projectSnapshot(after), reason: input.reason ?? null,
      summary: `Updated project ${after.code}`,
    });
    return { id: after.id, version: after.version };
  });

  return { createProject, updateProject };
}
