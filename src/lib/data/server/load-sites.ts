import type * as P from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { Database, Site, DailyWorkReport, DailyWorkItem, SiteIssue } from "@/types";
import { base, day, inIds, qty, tsOrNull, liveWhere, type LoadScope } from "./convert";

export const mapSite = (r: P.Site): Site => ({
  ...base(r), organisationId: r.organisationId, regionId: r.regionId, stateId: r.stateId, code: r.code, name: r.name,
  address: r.address, reportCutoffTime: r.reportCutoffTime, status: r.status,
});

export const mapDailyReport = (r: P.DailyWorkReport): DailyWorkReport => ({
  ...base(r), siteId: r.siteId, projectId: r.projectId, regionId: r.regionId, reportDate: day(r.reportDate),
  status: r.status, workersCount: r.workersCount, issues: r.issues, planForTomorrow: r.planForTomorrow,
  photoCount: r.photoCount, submittedById: r.submittedById, submittedAt: tsOrNull(r.submittedAt),
  reviewedById: r.reviewedById, reviewComment: r.reviewComment,
});

export const mapDailyItem = (r: P.DailyWorkItem): DailyWorkItem => ({
  ...base(r), reportId: r.reportId, boqItemId: r.boqItemId, plannedQty: qty(r.plannedQty), completedQty: qty(r.completedQty),
});

export const mapSiteIssue = (r: P.SiteIssue): SiteIssue => ({
  ...base(r), siteId: r.siteId, projectId: r.projectId, regionId: r.regionId, reportId: r.reportId, title: r.title,
  severity: r.severity, status: r.status, raisedById: r.raisedById, raisedOn: day(r.raisedOn),
  resolvedAt: tsOrNull(r.resolvedAt),
});

export type SiteTables = Pick<Database, "sites" | "dailyReports" | "dailyWorkItems" | "siteIssues">;

/**
 * Scope: regionIds, siteIds (site id for sites; siteId for reports/issues), projectIds (reports/issues only;
 * sites are not filtered by project). Work items follow the loaded reports.
 */
export async function loadSiteTables(prisma: PrismaClient, scope: LoadScope = {}): Promise<SiteTables> {
  const lw = liveWhere(scope);
  const rowScope = { ...lw, regionId: inIds(scope.regionIds), siteId: inIds(scope.siteIds), projectId: inIds(scope.projectIds) };
  const [sites, reports, issues] = await Promise.all([
    prisma.site.findMany({ where: { ...lw, regionId: inIds(scope.regionIds), id: inIds(scope.siteIds) }, orderBy: { id: "asc" } }),
    prisma.dailyWorkReport.findMany({ where: rowScope, orderBy: { id: "asc" } }),
    prisma.siteIssue.findMany({ where: rowScope, orderBy: { id: "asc" } }),
  ]);
  const items = await prisma.dailyWorkItem.findMany({ where: { ...lw, reportId: { in: reports.map((r) => r.id) } }, orderBy: { id: "asc" } });
  return {
    sites: sites.map(mapSite),
    dailyReports: reports.map(mapDailyReport),
    dailyWorkItems: items.map(mapDailyItem),
    siteIssues: issues.map(mapSiteIssue),
  };
}
