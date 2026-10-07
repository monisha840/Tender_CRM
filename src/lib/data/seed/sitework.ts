import { dayOfWeek, DEMO_TODAY, lastNDays } from "@/lib/dates";
import type { IssueSeverity, IssueStatus } from "@/types";
import { PROJECT_SPECS, type Template } from "./catalog";
import { at, dayOffset, meta, type SeedCtx } from "./helpers";
import { userId } from "./org";
import type { ProjectInfo } from "./projects";
import { SITE_USER } from "./workforce";

const ISSUES: Record<Template, string[]> = {
  stone: ["Conveyor stoppage window shorter than planned", "Shortage of PPE gloves", "Low coal flow, fewer pickers deployed"],
  paint: ["Heavy rain stopped blasting and painting", "Hot work permit delayed", "Scaffold clearance pending"],
  cbp: ["Shutdown window for the ash line not available", "Pipe delivery delayed", "Trench waterlogged"],
  steel: ["Crane not available for erection", "Fabricated members delayed from workshop", "Wind speed above limit for erection"],
  civil: ["Plant area access restricted during operations", "Cement delivery delayed", "Rain delayed concreting"],
  scaff: ["Scaffold material shortage", "Permit to work delayed", "Boiler access not released"],
  package: ["Plant access restricted for ash handling area", "Paint stock shortage", "Labour shortage due to local festival"],
};
const PLANS: Record<Template, string[]> = {
  stone: ["Continue picking on conveyor 3A/3B", "Shift rotation with night crew", "Clean-up of transfer points"],
  paint: ["Continue grit blasting on lower zone", "Apply primer on blasted surface", "Apply intermediate coat"],
  cbp: ["Lay and joint next pipe run", "Fix pipe supports", "Hydro-test completed section"],
  steel: ["Erect gallery bay 4", "Fabricate and match-mark members", "Bolt tightening and alignment"],
  civil: ["Repair concrete at foundation block", "Cast drain section", "Plastering and finishing"],
  scaff: ["Erect scaffolding at ESP casing", "Dismantle completed bay", "Inspect scaffold tags"],
  package: ["Civil repair of floor section", "Stone picking, all conveyors", "Primer coat on structures"],
};

/** Projects whose report is intentionally missing, for the "missing daily report" alerts. */
function isMissing(projectKey: string, date: string): boolean {
  if (projectKey === "p5_tangedco_scaff") return date === DEMO_TODAY;
  if (projectKey === "p3_mspgcl_cbp") return date === dayOffset(-1);
  if (projectKey === "p8_nalco_paint") return date >= dayOffset(-1);
  return false;
}

export function seedSiteWork(ctx: SeedCtx, projects: ProjectInfo[]) {
  const { db, rng } = ctx;

  PROJECT_SPECS.filter((spec) => !spec.completed).forEach((spec) => {
    const proj = projects.find((p) => p.key === spec.key)!;
    const items = db.boqItems.filter((b) => b.projectId === proj.id && b.unit !== "LS");
    // Subcontract labour on site, on top of our own named workers.
    const base = spec.template === "stone" ? 18 : spec.template === "paint" ? 8 : spec.template === "scaff" ? 6 : 5;
    const pmUser = userId(proj.pmKey);

    lastNDays(30).forEach((date, di) => {
      if (dayOfWeek(date) === 0 || isMissing(spec.key, date)) return;
      const rows = db.attendance.filter((a) => a.projectId === proj.id && a.date === date);
      const present = rows.length ? rows.reduce((sum, a) => sum + a.dayFraction, 0) : Math.round((spec.workers.count + 2) * rng.float(0.8, 0.95));
      const workers = Math.round(present) + Math.max(0, base + rng.int(-2, 3));
      const reportId = `dwr_${spec.key}_${date}`;
      const reviewed = date <= dayOffset(-2);
      const issue = rng.chance(0.3) ? rng.pick(ISSUES[spec.template]) : null;

      db.dailyReports.push({
        ...meta(reportId, at(date, "18:00")), siteId: proj.siteId, projectId: proj.id, regionId: proj.regionId, reportDate: date,
        status: reviewed ? "REVIEWED" : "SUBMITTED", workersCount: workers, issues: issue, planForTomorrow: rng.pick(PLANS[spec.template]),
        photoCount: rng.int(2, 6), submittedById: SITE_USER[proj.regionKey].engineer,
        submittedAt: at(date, `${rng.int(15, 18)}:${String(rng.int(0, 59)).padStart(2, "0")}`),
        reviewedById: reviewed ? pmUser : null, reviewComment: reviewed && rng.chance(0.3) ? "Noted. Please share area-wise progress tomorrow." : null,
      });

      for (let n = 0; n < 2; n++) {
        const item = items[(di + n) % items.length];
        const planned = Math.max(1, Math.round((Number(item.quantity) / (spec.durationDays * 0.75)) * rng.float(0.7, 1.4)));
        db.dailyWorkItems.push({
          ...meta(`dwi_${reportId}_${n + 1}`), reportId, boqItemId: item.id, plannedQty: planned.toFixed(3),
          completedQty: Math.round(planned * rng.float(0.55, 1.05)).toFixed(3),
        });
      }
    });
  });

  const issues: [string, string, IssueSeverity, IssueStatus, number][] = [
    ["p6_ntpc_steel", "Boom lift not available, erection of gallery bay 5 delayed", "HIGH", "OPEN", -9],
    ["p2_cspgcl_paint", "Hot work permit delays for blasting at Unit 3", "HIGH", "OPEN", -6],
    ["p3_mspgcl_cbp", "Ash line shutdown window not yet granted by the plant", "MEDIUM", "IN_PROGRESS", -12],
    ["p10_kpcl_pkg", "Plant access pass delays for new workers at ash handling area", "HIGH", "OPEN", -4],
    ["p5_tangedco_scaff", "Cuplock scaffold material short due to delayed supplier", "MEDIUM", "OPEN", -8],
    ["p1_ntpc_stone", "Conveyor stoppage windows reduce picking hours", "LOW", "RESOLVED", -20],
    ["p4_mspgcl_stone", "Wage payment delay to subcontract labour", "MEDIUM", "IN_PROGRESS", -7],
    ["p8_nalco_paint", "Rain halted painting at cooling tower", "LOW", "RESOLVED", -17],
  ];
  issues.forEach(([pk, title, severity, status, offset], i) => {
    const proj = projects.find((p) => p.key === pk)!;
    db.siteIssues.push({
      ...meta(`iss_${i + 1}`), siteId: proj.siteId, projectId: proj.id, regionId: proj.regionId, reportId: null, title, severity, status,
      raisedById: SITE_USER[proj.regionKey].engineer, raisedOn: dayOffset(offset), resolvedAt: status === "RESOLVED" ? at(dayOffset(offset + 5)) : null,
    });
  });
}
