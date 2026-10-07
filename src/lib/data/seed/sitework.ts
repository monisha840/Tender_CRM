import { dayOfWeek, DEMO_TODAY, lastNDays } from "@/lib/dates";
import { SITE_USER } from "./workforce";
import { SITE_DEFS, type ProjectInfo } from "./projects";
import { userId } from "./org";
import { at, dayOffset, meta, type SeedCtx } from "./helpers";
import type { IssueSeverity, IssueStatus } from "@/types";

const ISSUES = [
  "Heavy rain caused delay",
  "Shortage of material delayed work",
  "Machine breakdown: equipment under repair",
  "Utility shifting pending",
  "Labour shortage due to local festival",
  "Waterlogging in work area",
];
const PLANS: Record<string, string[]> = {
  road: ["Continue excavation", "Start GSB laying on completed stretch", "Compaction and levelling"],
  building: ["Continue RCC shuttering", "Brick masonry on first floor", "Plastering of completed walls"],
  pipeline: ["Continue trench excavation", "Pipe laying and jointing", "Valve chamber casting"],
  drain: ["Continue box drain casting", "Fix cover slabs", "Desilting of next reach"],
  bridge: ["Foundation concrete", "Shuttering for abutment", "Approach embankment filling"],
  maintenance: ["Patching of identified potholes", "Kerb stone laying", "Road marking"],
};

/** Sites whose report is intentionally missing, for the "missing daily report" alerts. */
function isMissing(siteId: string, date: string): boolean {
  if (siteId === "site_korba_pipe_2") return date >= dayOffset(-1);
  if (siteId === "site_mh_culvert_1") return date === dayOffset(-1);
  if (siteId === "site_csp_roads_1") return date === DEMO_TODAY;
  return false;
}

export function seedSiteWork(ctx: SeedCtx, projects: ProjectInfo[]) {
  const { db, rng } = ctx;

  SITE_DEFS.forEach((site) => {
    const proj = projects.find((p) => p.key === site.projectKey)!;
    const items = db.boqItems.filter((b) => b.projectId === proj.id && b.unit !== "LS");
    const base = site.id === "site_korba_road_1" ? 24 : site.workers + rng.int(4, 14);
    const pmUser = userId(proj.pmKey);

    lastNDays(14).forEach((date, di) => {
      if (dayOfWeek(date) === 0 || isMissing(site.id, date)) return;
      const present = db.attendance
        .filter((a) => a.siteId === site.id && a.date === date)
        .reduce((sum, a) => sum + a.dayFraction, 0);
      const flagshipToday = site.id === "site_korba_road_1" && date === DEMO_TODAY;
      const workers = flagshipToday ? 32 : Math.round(present) + Math.max(0, base + rng.int(-3, 3));
      const reportId = `dwr_${site.id}_${date}`;
      const reviewed = date <= dayOffset(-2);
      const issue = flagshipToday ? "Heavy rain caused delay" : rng.chance(0.3) ? rng.pick(ISSUES) : null;

      db.dailyReports.push({
        ...meta(reportId, at(date, "18:00")),
        siteId: site.id,
        projectId: proj.id,
        regionId: proj.regionId,
        reportDate: date,
        status: reviewed ? "REVIEWED" : "SUBMITTED",
        workersCount: workers,
        issues: issue,
        planForTomorrow: flagshipToday ? "Continue excavation" : rng.pick(PLANS[proj.template]),
        photoCount: rng.int(2, 6),
        submittedById: SITE_USER[proj.regionKey].engineer,
        submittedAt: at(date, `${rng.int(15, 18)}:${String(rng.int(0, 59)).padStart(2, "0")}`),
        reviewedById: reviewed ? pmUser : null,
        reviewComment: reviewed && rng.chance(0.3) ? "Noted. Please share chainage-wise progress tomorrow." : null,
      });

      if (flagshipToday) {
        db.dailyWorkItems.push({ ...meta(`dwi_${reportId}_1`), reportId, boqItemId: "boq_korba_road_1", plannedQty: "500.000", completedQty: "420.000" });
        return;
      }
      for (let n = 0; n < 2; n++) {
        const item = items[(di + n) % items.length];
        const total = Number(item.quantity);
        const planned = Math.max(1, Math.round((total / 120) * rng.float(0.7, 1.4)));
        db.dailyWorkItems.push({
          ...meta(`dwi_${reportId}_${n + 1}`),
          reportId,
          boqItemId: item.id,
          plannedQty: planned.toFixed(3),
          completedQty: Math.round(planned * rng.float(0.55, 1.05)).toFixed(3),
        });
      }
    });
  });

  const issues: [string, string, string, IssueSeverity, IssueStatus, number][] = [
    ["korba_road", "site_korba_road_1", "Overhead 11 kV line obstructs alignment at Km 2.4", "HIGH", "OPEN", -9],
    ["korba_pipe", "site_korba_pipe_1", "DI pipe supply delayed by 12 days", "HIGH", "OPEN", -6],
    ["korba_pipe", "site_korba_pipe_2", "Right-of-way dispute with landowner at Kusmunda", "HIGH", "IN_PROGRESS", -14],
    ["del_drain", "site_del_drain_1", "Traffic diversion approval pending from traffic police", "MEDIUM", "OPEN", -5],
    ["mh_school", "site_mh_school_1", "Steel rebar delivery behind schedule", "HIGH", "OPEN", -4],
    ["mh_culvert", "site_mh_culvert_1", "Monsoon waterlogging in foundation pit", "MEDIUM", "IN_PROGRESS", -8],
    ["korba_hall", "site_korba_hall_1", "Brick batch rejected on strength test", "LOW", "RESOLVED", -20],
    ["del_road", "site_del_road_1", "Night-work permission for resurfacing", "MEDIUM", "RESOLVED", -17],
  ];
  issues.forEach(([pk, siteId, title, severity, status, offset], i) => {
    const proj = projects.find((p) => p.key === pk)!;
    db.siteIssues.push({
      ...meta(`iss_${i + 1}`),
      siteId,
      projectId: proj.id,
      regionId: proj.regionId,
      reportId: null,
      title,
      severity,
      status,
      raisedById: SITE_USER[proj.regionKey].engineer,
      raisedOn: dayOffset(offset),
      resolvedAt: status === "RESOLVED" ? at(dayOffset(offset + 5)) : null,
    });
  });
}
