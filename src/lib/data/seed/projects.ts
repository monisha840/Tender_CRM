import { addDays, daysBetween, DEMO_TODAY } from "@/lib/dates";
import { fromPaise, toPaise } from "@/lib/money";
import type { Id, IsoDate, Money } from "@/types";
import { employeeIdOfUser, userId } from "./org";
import type { ConvertedTender } from "./tenders";
import { at, dayOffset, lakh, meta, RegionKey, type RegionKeyName, type SeedCtx } from "./helpers";

type Template = "road" | "building" | "pipeline" | "drain" | "bridge" | "maintenance";

interface BoqTemplateItem {
  name: string;
  unit: string;
  rate: number;
  share: number;
}

const BOQ: Record<Template, BoqTemplateItem[]> = {
  road: [
    { name: "Road excavation", unit: "m", rate: 620, share: 0.14 },
    { name: "Granular sub-base (GSB)", unit: "cum", rate: 1450, share: 0.18 },
    { name: "Wet mix macadam (WMM)", unit: "cum", rate: 1980, share: 0.2 },
    { name: "Bituminous concrete (BC)", unit: "cum", rate: 9500, share: 0.28 },
    { name: "Pipe culverts (NP-3, 900 mm)", unit: "m", rate: 6800, share: 0.12 },
  ],
  building: [
    { name: "Earthwork in foundation", unit: "cum", rate: 380, share: 0.06 },
    { name: "PCC M10 bed", unit: "cum", rate: 5200, share: 0.05 },
    { name: "RCC M25 frame & slab", unit: "cum", rate: 8400, share: 0.34 },
    { name: "Fly-ash brick masonry", unit: "cum", rate: 5600, share: 0.16 },
    { name: "Plastering & finishing", unit: "sqm", rate: 380, share: 0.12 },
    { name: "Flooring, doors & windows", unit: "sqm", rate: 1850, share: 0.17 },
  ],
  pipeline: [
    { name: "Trench excavation", unit: "m", rate: 420, share: 0.12 },
    { name: "Supply & laying DI pipe 300 mm", unit: "m", rate: 9800, share: 0.46 },
    { name: "Sluice valves & fittings", unit: "nos", rate: 38000, share: 0.14 },
    { name: "RCC valve chambers", unit: "nos", rate: 64000, share: 0.1 },
    { name: "Hydro-testing & commissioning", unit: "m", rate: 220, share: 0.06 },
  ],
  drain: [
    { name: "Excavation for drain", unit: "cum", rate: 340, share: 0.12 },
    { name: "RCC box drain M30", unit: "cum", rate: 9200, share: 0.44 },
    { name: "Precast cover slabs", unit: "nos", rate: 4200, share: 0.18 },
    { name: "Desilting & disposal", unit: "cum", rate: 520, share: 0.08 },
  ],
  bridge: [
    { name: "Excavation in foundation", unit: "cum", rate: 420, share: 0.08 },
    { name: "RCC M25 in foundation & abutments", unit: "cum", rate: 8800, share: 0.3 },
    { name: "RCC M30 superstructure slab", unit: "cum", rate: 10200, share: 0.28 },
    { name: "Approach embankment", unit: "cum", rate: 360, share: 0.12 },
    { name: "Bituminous approach road", unit: "cum", rate: 7400, share: 0.12 },
  ],
  maintenance: [
    { name: "Pothole patching with BT", unit: "cum", rate: 8600, share: 0.38 },
    { name: "Crack sealing", unit: "m", rate: 160, share: 0.12 },
    { name: "Kerb stone & footpath", unit: "m", rate: 780, share: 0.22 },
    { name: "Road marking & signage", unit: "sqm", rate: 210, share: 0.1 },
  ],
};
/** Makes some BOQ items run ahead/behind the project average; normalised so the weighted mean is exact. */
const PACE = [1.3, 1.1, 0.95, 0.8, 0.9, 0.7, 0.6];

export interface SiteDef {
  id: Id;
  projectKey: string;
  code: string;
  name: string;
  address: string;
  cutoff: string;
  engineerEmp: Id;
  supervisorEmp: Id;
  /** Named daily-wage workers on this site. */
  workers: number;
  dailyWage: number;
}

interface ProjectSpec {
  key: string;
  id: Id;
  code: string;
  name: string;
  region: RegionKeyName;
  pm: string;
  template: Template;
  /** Percentage points behind (+) or ahead (−) of the time-based plan. */
  lag: number;
  sites: Omit<SiteDef, "projectKey">[];
  /** Direct-award projects have no tender. */
  direct?: { clientId: Id; value: number; startOffset: number; endOffset: number; gstId: Id };
}

const mk = (id: string, code: string, name: string, address: string, eng: string, sup: string, workers: number, wage: number, cutoff = "18:00") => ({
  id, code, name, address, cutoff, engineerEmp: eng, supervisorEmp: sup, workers, dailyWage: wage,
});

export const PROJECT_SPECS: ProjectSpec[] = [
  {
    key: "korba_road", id: "prj_korba_road", code: "PRJ-KRB-001", name: "Korba–Katghora to Dipka Colliery Road (Pkg 2)", region: "korba", pm: "pm_korba1", template: "road", lag: 8,
    sites: [mk("site_korba_road_1", "KRB-RD-S1", "Korba Road Site 1", "Dipka, Korba, Chhattisgarh", employeeIdOfUser("se_korba"), employeeIdOfUser("sup_korba"), 6, 640)],
  },
  {
    key: "korba_hall", id: "prj_korba_hall", code: "PRJ-KRB-002", name: "Community Hall & Boundary Wall, Ward 18", region: "korba", pm: "pm_korba2", template: "building", lag: 0,
    sites: [mk("site_korba_hall_1", "KRB-CH-S1", "Community Hall Site, Ward 18", "Ward 18, Korba", "emp_se_site_korba_hall_1", "emp_sup_site_korba_hall_1", 4, 620)],
  },
  {
    key: "korba_pipe", id: "prj_korba_pipe", code: "PRJ-KRB-003", name: "Water Supply Pipeline, Dipka–Kusmunda", region: "korba", pm: "pm_korba2", template: "pipeline", lag: 24,
    sites: [
      mk("site_korba_pipe_1", "KRB-WP-S1", "Dipka North Pipeline", "Dipka North, Korba", "emp_se_site_korba_pipe_1", "emp_sup_site_korba_pipe_1", 5, 640),
      mk("site_korba_pipe_2", "KRB-WP-S2", "Kusmunda Pipeline", "Kusmunda, Korba", "emp_se_site_korba_pipe_2", "emp_sup_site_korba_pipe_2", 4, 640),
    ],
  },
  {
    key: "csp_roads", id: "prj_csp_roads", code: "PRJ-KRB-004", name: "Internal Road Maintenance, CSPDCL Colony, Korba", region: "korba", pm: "pm_korba1", template: "maintenance", lag: -2,
    direct: { clientId: "cl_cspdcl", value: 62, startOffset: -150, endOffset: 60, gstId: "gst_cg" },
    sites: [mk("site_csp_roads_1", "KRB-CM-S1", "CSPDCL Colony Roads", "CSPDCL Colony, Korba", "emp_se_site_csp_roads_1", "emp_sup_site_csp_roads_1", 3, 620)],
  },
  {
    key: "del_drain", id: "prj_del_drain", code: "PRJ-DEL-001", name: "Stormwater Drain Remodelling, Rohini Sector 24", region: "delhi", pm: "pm_delhi", template: "drain", lag: 12,
    sites: [mk("site_del_drain_1", "DEL-SD-S1", "Rohini Sector 24 Drain", "Sector 24, Rohini, Delhi", employeeIdOfUser("se_delhi"), employeeIdOfUser("sup_delhi"), 6, 860)],
  },
  {
    key: "del_road", id: "prj_del_road", code: "PRJ-DEL-002", name: "Road Resurfacing, Ward 112 South Zone", region: "delhi", pm: "pm_delhi", template: "road", lag: 3,
    sites: [mk("site_del_road_1", "DEL-RR-S1", "Ward 112 Roads", "South Zone, Delhi", "emp_se_site_del_road_1", "emp_sup_site_del_road_1", 5, 840, "17:30")],
  },
  {
    key: "mh_culvert", id: "prj_mh_culvert", code: "PRJ-MH-001", name: "Culvert & Approach Road, Nagpur–Katol", region: "mh", pm: "pm_mh", template: "bridge", lag: 2,
    sites: [
      mk("site_mh_culvert_1", "MH-CV-S1", "Culvert A (Km 12)", "Km 12, Nagpur–Katol Road", employeeIdOfUser("se_mh"), employeeIdOfUser("sup_mh"), 5, 760),
      mk("site_mh_culvert_2", "MH-CV-S2", "Katol Approach Road", "Katol approach, Nagpur", "emp_se_site_mh_culvert_2", "emp_sup_site_mh_culvert_2", 4, 760),
    ],
  },
  {
    key: "mh_school", id: "prj_mh_school", code: "PRJ-MH-002", name: "Municipal School Building Block B, Hadapsar", region: "mh", pm: "pm_mh", template: "building", lag: 19,
    sites: [mk("site_mh_school_1", "MH-SB-S1", "Hadapsar School Site", "Hadapsar, Pune", "emp_se_site_mh_school_1", "emp_sup_site_mh_school_1", 6, 780)],
  },
];

export const SITE_DEFS: SiteDef[] = PROJECT_SPECS.flatMap((p) => p.sites.map((s) => ({ ...s, projectKey: p.key })));

export interface ProjectInfo {
  key: string;
  id: Id;
  regionKey: RegionKeyName;
  regionId: Id;
  gstId: Id;
  clientId: Id;
  contractValue: Money;
  startDate: IsoDate;
  endDate: IsoDate;
  pmKey: string;
  template: Template;
  /** Intended share of contract value executed to date (0–100). */
  actualPct: number;
  /** Time-elapsed share of the planned duration (0–100). */
  expectedPct: number;
  siteIds: Id[];
  tenderId: Id | null;
}

export function seedProjects(ctx: SeedCtx, converted: ConvertedTender[]): ProjectInfo[] {
  const { db } = ctx;
  const infos: ProjectInfo[] = [];

  PROJECT_SPECS.forEach((spec) => {
    const conv = converted.find((c) => c.key === spec.key);
    const direct = spec.direct;
    if (!conv && !direct) throw new Error(`Project ${spec.key} has neither a converted tender nor a direct award`);

    const contractValue = conv ? conv.awardedAmount : lakh(direct!.value);
    const startDate = conv ? conv.startDate : dayOffset(direct!.startOffset);
    const endDate = conv ? addDays(conv.startDate, conv.completionDays) : dayOffset(direct!.endOffset);
    const clientId = conv ? conv.clientId : direct!.clientId;
    const gstId = conv ? conv.gstId : direct!.gstId;
    const regionId = RegionKey[spec.region];
    const total = Math.max(1, daysBetween(startDate, endDate));
    const expectedPct = Math.min(100, Math.max(0, (daysBetween(startDate, DEMO_TODAY) / total) * 100));
    const actualPct = Math.max(0, expectedPct - spec.lag);

    db.projects.push({
      ...meta(spec.id, at(conv ? conv.convertedDate : startDate)),
      code: spec.code,
      name: spec.name,
      tenderId: conv ? conv.tenderId : null,
      clientId,
      regionId,
      gstRegistrationId: gstId,
      contractValue,
      startDate,
      plannedEndDate: endDate,
      statusId: "pst_progress",
      projectManagerId: employeeIdOfUser(spec.pm),
      healthOverride: null,
    });

    if (conv) {
      const tender = db.tenders.find((t) => t.id === conv.tenderId)!;
      db.projectConversions.push({
        ...meta(`conv_${spec.key}`),
        tenderId: conv.tenderId,
        projectId: spec.id,
        convertedById: userId("director"),
        convertedAt: at(conv.convertedDate, "12:30"),
        snapshot: {
          tenderNo: tender.tenderNo,
          estimatedValue: tender.estimatedValue,
          awardedAmount: conv.awardedAmount,
          loaDate: conv.loaDate,
          agreementDate: conv.agreementDate,
        },
        overrideReason: null,
        approvalRequestId: null,
      });
    }

    db.projectMembers.push({
      ...meta(`pm_${spec.key}`),
      projectId: spec.id,
      employeeId: employeeIdOfUser(spec.pm),
      roleLabel: "Project Manager",
      fromDate: startDate,
      toDate: null,
    });

    // ---- BOQ: items sum exactly to the contract value (last row is a lump-sum balancing item) ----
    const items = BOQ[spec.template];
    const valuePaise = toPaise(contractValue);
    const rows: { name: string; unit: string; qty: number; ratePaise: bigint; amountPaise: bigint; ls: boolean; share: number }[] = [];
    let used = BigInt(0);
    items.forEach((it) => {
      const targetRupees = (Number(valuePaise) / 100) * it.share;
      const qty = Math.max(1, Math.round(targetRupees / it.rate));
      const ratePaise = BigInt(it.rate * 100);
      const amountPaise = ratePaise * BigInt(qty);
      used += amountPaise;
      rows.push({ name: it.name, unit: it.unit, qty, ratePaise, amountPaise, ls: false, share: it.share });
    });
    const remainder = valuePaise - used;
    rows.push({
      name: "Miscellaneous and ancillary works", unit: "LS", qty: 1, ratePaise: remainder, amountPaise: remainder, ls: true,
      share: Number(remainder) / Number(valuePaise),
    });

    // Per-item execution: weighted mean equals the project's actual %.
    const norm = rows.reduce((acc, r, i) => acc + r.share * PACE[i % PACE.length], 0);
    rows.forEach((r, i) => {
      const itemNo = `${i + 1}`;
      const frac = Math.min(1, Math.max(0, ((actualPct / 100) * PACE[i % PACE.length]) / norm));
      const executed = r.ls ? frac : Math.round(r.qty * frac);
      db.boqItems.push({
        ...meta(`boq_${spec.key}_${i + 1}`),
        projectId: spec.id,
        itemNo,
        description: r.name,
        unit: r.unit,
        quantity: r.qty.toFixed(3),
        rate: fromPaise(r.ratePaise),
        amount: fromPaise(r.amountPaise),
        executedQty: executed.toFixed(3),
      });
    });

    // ---- Sites ----
    spec.sites.forEach((s) =>
      db.sites.push({
        ...meta(s.id),
        projectId: spec.id,
        regionId,
        code: s.code,
        name: s.name,
        address: s.address,
        inchargeId: s.engineerEmp,
        reportCutoffTime: s.cutoff,
        status: "ACTIVE",
      }),
    );

    infos.push({
      key: spec.key, id: spec.id, regionKey: spec.region, regionId, gstId, clientId, contractValue, startDate, endDate,
      pmKey: spec.pm, template: spec.template, actualPct, expectedPct, siteIds: spec.sites.map((s) => s.id),
      tenderId: conv ? conv.tenderId : null,
    });
  });

  return infos;
}
