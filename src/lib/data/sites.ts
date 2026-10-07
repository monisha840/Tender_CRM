import { dayOfWeek, getToday, lastNDays } from "@/lib/dates";
import type { Database, Id, IsoDate, Project, Site, SiteIssue } from "@/types";
import { byId, inRegion, organisationName, regionName, sum, type RegionFilter } from "./shared";

export interface SiteRow {
  site: Site;
  organisationName: string;
  regionName: string;
  /** Projects currently running at this plant. */
  projects: Project[];
  /** Reports submitted today / reports expected today (one per running project). */
  reportsToday: number;
  reportsExpected: number;
  openIssues: number;
}

/** Named plant sites with what runs there. */
export function listSites(db: Database, region: RegionFilter = "ALL"): SiteRow[] {
  const today = getToday();
  return db.sites
    .filter((s) => !s.deletedAt && inRegion(region, s.regionId))
    .map((site): SiteRow => {
      const projects = db.projects.filter((p) => p.siteId === site.id && !p.deletedAt);
      return {
        site,
        organisationName: organisationName(db, site.organisationId),
        regionName: regionName(db, site.regionId),
        projects,
        reportsToday: projects.filter((p) => db.dailyReports.some((r) => r.projectId === p.id && r.reportDate === today)).length,
        reportsExpected: projects.length,
        openIssues: db.siteIssues.filter((i) => i.siteId === site.id && i.status !== "RESOLVED").length,
      };
    })
    .sort((a, b) => a.site.code.localeCompare(b.site.code));
}

export function getDailyReports(db: Database, filters: { siteId?: Id; projectId?: Id; region?: RegionFilter; from?: IsoDate; to?: IsoDate } = {}) {
  return db.dailyReports
    .filter((r) => !filters.siteId || r.siteId === filters.siteId)
    .filter((r) => !filters.projectId || r.projectId === filters.projectId)
    .filter((r) => inRegion(filters.region ?? "ALL", r.regionId))
    .filter((r) => (!filters.from || r.reportDate >= filters.from) && (!filters.to || r.reportDate <= filters.to))
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate));
}

/** One report with its BOQ work items and a computed progress percentage per item. */
export function getDailyReport(db: Database, reportId: Id) {
  const report = byId(db.dailyReports, reportId);
  if (!report) return null;
  return {
    report,
    site: byId(db.sites, report.siteId)!,
    items: db.dailyWorkItems
      .filter((i) => i.reportId === reportId)
      .map((i) => {
        const boq = byId(db.boqItems, i.boqItemId)!;
        const planned = Number(i.plannedQty);
        return { item: i, boq, unit: boq.unit, progressPct: planned ? Math.round((Number(i.completedQty) / planned) * 100) : 0 };
      }),
  };
}

export interface MissingReport {
  project: Project;
  site: Site;
}

/** Running projects without a submitted report for `date` (one report per project per day). Sundays are off. */
export function getMissingReports(db: Database, date: IsoDate = getToday(), region: RegionFilter = "ALL"): MissingReport[] {
  if (dayOfWeek(date) === 0) return [];
  return db.projects
    .filter((p) => !p.deletedAt && inRegion(region, p.regionId) && db.sites.some((s) => s.id === p.siteId && s.status === "ACTIVE"))
    .filter((p) => !db.dailyReports.some((r) => r.projectId === p.id && r.reportDate === date && r.status !== "DRAFT"))
    .map((project) => ({ project, site: byId(db.sites, project.siteId)! }));
}

/** Daily manpower (sum of reported workers) for the last `days` days, for a trend chart. */
export function getManpowerTrend(db: Database, region: RegionFilter = "ALL", days = 14) {
  return lastNDays(days).map((date) => ({
    date,
    workers: sum(db.dailyReports.filter((r) => r.reportDate === date && inRegion(region, r.regionId)).map((r) => r.workersCount)),
    reports: db.dailyReports.filter((r) => r.reportDate === date && inRegion(region, r.regionId)).length,
  }));
}

export function listSiteIssues(db: Database, region: RegionFilter = "ALL", openOnly = false): SiteIssue[] {
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  return db.siteIssues
    .filter((i) => inRegion(region, i.regionId) && (!openOnly || i.status !== "RESOLVED"))
    .sort((a, b) => rank[a.severity] - rank[b.severity] || b.raisedOn.localeCompare(a.raisedOn));
}

/** Net stock per material at a plant site: receipts/returns minus issues, consumption and wastage. */
export function getSiteStock(db: Database, siteId: Id) {
  const sign: Record<string, number> = { RECEIPT: 1, RETURN: 1, ADJUSTMENT: 1, TRANSFER: -1, ISSUE: -1, CONSUMPTION: -1, WASTAGE: -1 };
  const balances = new Map<Id, number>();
  db.stockTransactions
    .filter((t) => t.siteId === siteId)
    .forEach((t) => balances.set(t.materialId, (balances.get(t.materialId) ?? 0) + sign[t.type] * Number(t.quantity)));
  return [...balances.entries()].map(([materialId, balance]) => ({ material: byId(db.materials, materialId)!, balance }));
}
