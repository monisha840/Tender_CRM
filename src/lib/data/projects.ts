import { daysBetween, getToday } from "@/lib/dates";
import { moneyToNumber, sumMoney } from "@/lib/money";
import type { Database, HealthStatus, Id, Money, Project, ProjectStatus, Site } from "@/types";
import { getProjectBilling } from "./accounts";
import { isLive } from "./definitions";
import { byId, employeeName, inRegion, organisationName, regionName, sum, type RegionFilter } from "./shared";

/**
 * Health rules (configurable later). The gap is how many percentage points the executed value
 * is behind the time-based plan. Labels/colours live in StatusBadge, not here.
 */
export const HEALTH_RULES = { amberGapPct: 5, redGapPct: 15 } as const;

export interface ProjectRow {
  project: Project;
  status: ProjectStatus;
  organisationName: string;
  regionName: string;
  managerName: string;
  /** The plant site where the work is done. */
  site: Site | null;
  serviceLineName: string;
  /** Billed (taxable value, excl. GST), invoiced incl. GST, received and still to receive. */
  billing: { billed: Money; invoicedTotal: Money; received: Money; outstanding: Money };
  /** Executed value as a share of contract value, 0–100. */
  progressPct: number;
  /** Time elapsed as a share of the planned duration, 0–100. */
  plannedPct: number;
  gapPct: number;
  health: HealthStatus;
  daysToEnd: number;
}

export function getProjectProgress(db: Database, projectId: Id): { progressPct: number; plannedPct: number } {
  const project = byId(db.projects, projectId);
  if (!project) return { progressPct: 0, plannedPct: 0 };
  const items = db.boqItems.filter((b) => isLive(b) && b.projectId === projectId);
  const total = sum(items.map((b) => moneyToNumber(b.amount)));
  const done = sum(items.map((b) => Number(b.executedQty) * moneyToNumber(b.rate)));
  const today = getToday();
  const span = Math.max(1, daysBetween(project.startDate ?? today, project.plannedEndDate ?? today));
  const plannedPct = Math.min(100, Math.max(0, (daysBetween(project.startDate ?? today, today) / span) * 100));
  return { progressPct: total ? Math.min(100, (done / total) * 100) : 0, plannedPct };
}

export function computeHealth(project: Project, progressPct: number, plannedPct: number): HealthStatus {
  if (project.healthOverride) return project.healthOverride;
  const gap = plannedPct - progressPct;
  if (gap > HEALTH_RULES.redGapPct) return "RED";
  if (gap > HEALTH_RULES.amberGapPct) return "AMBER";
  return "GREEN";
}

export function listProjects(db: Database, region: RegionFilter = "ALL", health?: HealthStatus): ProjectRow[] {
  const today = getToday();
  return db.projects
    .filter((p) => isLive(p) && inRegion(region, p.regionId))
    .map((project): ProjectRow => {
      const { progressPct, plannedPct } = getProjectProgress(db, project.id);
      return {
        project,
        status: byId(db.projectStatuses, project.statusId)!,
        organisationName: organisationName(db, project.organisationId),
        regionName: regionName(db, project.regionId),
        managerName: employeeName(db, project.projectManagerId),
        site: byId(db.sites, project.siteId) ?? null,
        serviceLineName: byId(db.serviceLines, project.serviceLineId)?.name ?? "—",
        billing: (({ billed, invoicedTotal, received, outstanding }) => ({ billed, invoicedTotal, received, outstanding }))(getProjectBilling(db, project.id)),
        progressPct,
        plannedPct,
        gapPct: plannedPct - progressPct,
        health: computeHealth(project, progressPct, plannedPct),
        daysToEnd: project.plannedEndDate ? daysBetween(today, project.plannedEndDate) : 0,
      };
    })
    .filter((r) => !health || r.health === health)
    .sort((a, b) => a.project.code.localeCompare(b.project.code));
}

export function getProject(db: Database, id: Id): ProjectRow | null {
  return listProjects(db).find((r) => r.project.id === id) ?? null;
}

export function getHealthDistribution(db: Database, region: RegionFilter = "ALL") {
  const rows = listProjects(db, region);
  return (["GREEN", "AMBER", "RED"] as HealthStatus[]).map((health) => ({
    health,
    count: rows.filter((r) => r.health === health).length,
  }));
}

export function getProjectTotals(db: Database, region: RegionFilter = "ALL") {
  const rows = listProjects(db, region);
  return {
    count: rows.length,
    contractValue: sumMoney(rows.map((r) => r.project.contractValue)),
    delayed: rows.filter((r) => r.health === "RED").length,
  };
}
