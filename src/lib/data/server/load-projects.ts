import type * as P from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { Database, Project, ProjectMember, ProjectProgressSnapshot, BoqItem, ProjectBudgetLine, CostEntry } from "@/types";
import { base, day, dayOrNull, inIds, money, pct, pctOrNull, qty, liveWhere, type LoadScope } from "./convert";

export const mapProject = (r: P.Project): Project => ({
  ...base(r),
  code: r.code, name: r.name, serviceLineId: r.serviceLineId, siteId: r.siteId, contractType: r.contractType,
  workOrderNo: r.workOrderNo, workOrderDate: day(r.workOrderDate), billingCycle: r.billingCycle,
  paymentTermsDays: r.paymentTermsDays, tenderId: r.tenderId, organisationId: r.organisationId, regionId: r.regionId,
  gstRegistrationId: r.gstRegistrationId, contractValue: money(r.contractValue),
  startDate: dayOrNull(r.startDate), plannedEndDate: dayOrNull(r.plannedEndDate),
  statusId: r.statusId, projectManagerId: r.projectManagerId, healthOverride: r.healthOverride,
  jurisdiction: r.jurisdiction, escalationType: r.escalationType,
  ldPercent: pctOrNull(r.ldPercent), pbgPercent: pctOrNull(r.pbgPercent),
  securityDepositPercent: pctOrNull(r.securityDepositPercent), retentionPercent: pctOrNull(r.retentionPercent),
  defectLiabilityMonths: r.defectLiabilityMonths, sublettingAllowed: r.sublettingAllowed,
  deploymentNorms: r.deploymentNorms, clauseNotes: r.clauseNotes,
});

export const mapMember = (r: P.ProjectMember): ProjectMember => ({
  ...base(r), projectId: r.projectId, employeeId: r.employeeId, roleLabel: r.roleLabel,
  fromDate: day(r.fromDate), toDate: dayOrNull(r.toDate),
});

export const mapProgress = (r: P.ProjectProgressSnapshot): ProjectProgressSnapshot => ({
  ...base(r), projectId: r.projectId, month: r.month, plannedPct: pct(r.plannedPct), actualPct: pct(r.actualPct),
});

export const mapBoqItem = (r: P.BoqItem): BoqItem => ({
  ...base(r), projectId: r.projectId, itemNo: r.itemNo, description: r.description, unit: r.unit,
  quantity: qty(r.quantity), rate: money(r.rate), amount: money(r.amount), executedQty: qty(r.executedQty),
});

export const mapBudgetLine = (r: P.ProjectBudgetLine): ProjectBudgetLine => ({
  ...base(r), projectId: r.projectId, expenseCategoryId: r.expenseCategoryId, plannedAmount: money(r.plannedAmount),
});

export const mapCostEntry = (r: P.CostEntry): CostEntry => ({
  ...base(r), projectId: r.projectId, siteId: r.siteId, regionId: r.regionId, expenseCategoryId: r.expenseCategoryId,
  kind: r.kind, sourceType: r.sourceType, sourceId: r.sourceId, amount: money(r.amount), date: day(r.date),
});

export type ProjectTables = Pick<Database, "projects" | "projectMembers" | "progressSnapshots" | "boqItems" | "projectBudgetLines" | "costEntries">;

/** Scope: regionIds, projectIds (project id), siteIds (project.siteId). Child tables follow the loaded projects. */
export async function loadProjectTables(prisma: PrismaClient, scope: LoadScope = {}): Promise<ProjectTables> {
  const lw = liveWhere(scope);
  const projects = await prisma.project.findMany({
    where: { ...lw, regionId: inIds(scope.regionIds), id: inIds(scope.projectIds), siteId: inIds(scope.siteIds) },
    orderBy: { id: "asc" },
  });
  const byProject = { projectId: { in: projects.map((p) => p.id) } };
  const [members, progress, boq, budgets, costs] = await Promise.all([
    prisma.projectMember.findMany({ where: { ...byProject, ...lw }, orderBy: { id: "asc" } }),
    prisma.projectProgressSnapshot.findMany({ where: { ...byProject, ...lw }, orderBy: { id: "asc" } }),
    prisma.boqItem.findMany({ where: { ...byProject, ...lw }, orderBy: { id: "asc" } }),
    prisma.projectBudgetLine.findMany({ where: { ...byProject, ...lw }, orderBy: { id: "asc" } }),
    prisma.costEntry.findMany({ where: { ...byProject, ...lw }, orderBy: { id: "asc" } }),
  ]);
  return {
    projects: projects.map(mapProject),
    projectMembers: members.map(mapMember),
    progressSnapshots: progress.map(mapProgress),
    boqItems: boq.map(mapBoqItem),
    projectBudgetLines: budgets.map(mapBudgetLine),
    costEntries: costs.map(mapCostEntry),
  };
}
