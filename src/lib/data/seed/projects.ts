import { addDays, daysBetween, DEMO_TODAY, monthOf } from "@/lib/dates";
import { fromPaise, toPaise } from "@/lib/money";
import type { Id, IsoDate, Money } from "@/types";
import { PROJECT_SPECS, SITES, type Template } from "./catalog";
import { employeeIdOfUser, userId } from "./org";
import type { ConvertedTender } from "./tenders";
import { at, meta, RegionKey, type RegionKeyName, type SeedCtx } from "./helpers";

interface BoqTemplateItem {
  name: string;
  unit: string;
  rate: number;
  share: number;
}

/** BOQ per service line. Units follow the client: man-days, sq m, running metres and MT. */
const BOQ: Record<Template, BoqTemplateItem[]> = {
  stone: [
    { name: "Stone pickers on running conveyors", unit: "man-day", rate: 880, share: 0.62 },
    { name: "Helpers and loaders", unit: "man-day", rate: 760, share: 0.16 },
    { name: "Supervisors", unit: "man-day", rate: 1450, share: 0.1 },
  ],
  paint: [
    { name: "Surface preparation by grit blasting", unit: "sq m", rate: 285, share: 0.22 },
    { name: "Epoxy zinc-rich primer, 75 micron", unit: "sq m", rate: 260, share: 0.18 },
    { name: "Epoxy MIO intermediate coat, 100 micron", unit: "sq m", rate: 310, share: 0.2 },
    { name: "Polyurethane finish coat, 50 micron", unit: "sq m", rate: 240, share: 0.16 },
    { name: "Scaffolding for painting access", unit: "sq m", rate: 180, share: 0.12 },
  ],
  cbp: [
    { name: "Supply of cast basalt lined MS pipe, 250 NB", unit: "running metre", rate: 12000, share: 0.46 },
    { name: "Laying, alignment and jointing", unit: "running metre", rate: 1800, share: 0.14 },
    { name: "Bends, tees and special fittings", unit: "MT", rate: 185000, share: 0.12 },
    { name: "Pipe supports and structural steel", unit: "MT", rate: 98000, share: 0.1 },
  ],
  steel: [
    { name: "Supply of structural steel", unit: "MT", rate: 66000, share: 0.4 },
    { name: "Fabrication of structural steel", unit: "MT", rate: 22000, share: 0.14 },
    { name: "Erection of structural steel", unit: "MT", rate: 18500, share: 0.14 },
    { name: "Surface treatment and painting", unit: "sq m", rate: 420, share: 0.1 },
    { name: "Civil foundations", unit: "cum", rate: 8200, share: 0.12 },
  ],
  civil: [
    { name: "RCC and PCC repair works", unit: "cum", rate: 9200, share: 0.3 },
    { name: "Reinforcement steel", unit: "MT", rate: 72000, share: 0.16 },
    { name: "Brick masonry and plastering", unit: "sq m", rate: 520, share: 0.16 },
    { name: "Drains and trenches", unit: "running metre", rate: 3200, share: 0.18 },
  ],
  scaff: [
    { name: "Erection and dismantling of scaffolding", unit: "sq m", rate: 240, share: 0.34 },
    { name: "Scaffolding hire (per sq m-month)", unit: "sq m", rate: 95, share: 0.26 },
    { name: "Rigging and lifting", unit: "MT", rate: 5200, share: 0.14 },
    { name: "Safety nets and barricading", unit: "sq m", rate: 140, share: 0.1 },
  ],
  package: [
    { name: "Civil repair works to ash handling area", unit: "sq m", rate: 1400, share: 0.3 },
    { name: "Stone picking manpower", unit: "man-day", rate: 840, share: 0.28 },
    { name: "Industrial painting, blasting and coating", unit: "sq m", rate: 520, share: 0.26 },
    { name: "Scaffolding for access", unit: "sq m", rate: 210, share: 0.08 },
  ],
};
/** Makes some BOQ items run ahead/behind the project average; normalised so the weighted mean is exact. */
const PACE = [1.3, 1.1, 0.95, 0.8, 0.9, 0.7, 0.6];

export interface ProjectInfo {
  key: string;
  id: Id;
  regionKey: RegionKeyName;
  regionId: Id;
  gstId: Id;
  organisationId: Id;
  siteId: Id;
  stateId: Id;
  contractValue: Money;
  startDate: IsoDate;
  endDate: IsoDate;
  pmKey: string;
  template: Template;
  billing: "MONTHLY" | "MILESTONE" | "ON_COMPLETION";
  paymentTermsDays: number;
  /** Intended share of contract value executed to date (0–100). */
  actualPct: number;
  /** Time-elapsed share of the planned duration (0–100). */
  expectedPct: number;
  tenderId: Id;
  /** Finished contract: 100% executed, fully billed and paid, no active workforce. */
  completed: boolean;
}

export function seedProjects(ctx: SeedCtx, converted: ConvertedTender[]): ProjectInfo[] {
  const { db } = ctx;
  const infos: ProjectInfo[] = [];

  SITES.forEach((s) =>
    db.sites.push({
      ...meta(s.id), organisationId: s.org, regionId: RegionKey[s.region], stateId: s.state, code: s.code, name: s.name, address: s.address,
      reportCutoffTime: s.cutoff, status: "ACTIVE",
    }),
  );

  PROJECT_SPECS.forEach((spec) => {
    const conv = converted.find((c) => c.key === spec.key);
    if (!conv) throw new Error(`Project ${spec.key} has no converted tender`);
    const site = SITES.find((s) => s.id === spec.site)!;
    const id = `prj_${spec.key}`;
    const contractValue = conv.awardedAmount;
    const startDate = conv.startDate;
    const endDate = addDays(startDate, spec.durationDays);
    const total = Math.max(1, daysBetween(startDate, endDate));
    const completed = !!spec.completed;
    const expectedPct = Math.min(100, Math.max(0, (daysBetween(startDate, DEMO_TODAY) / total) * 100));
    const actualPct = completed ? 100 : Math.max(0, expectedPct - spec.lag);

    db.projects.push({
      ...meta(id, at(conv.convertedDate)),
      code: spec.code,
      name: spec.name,
      serviceLineId: conv.serviceLineId,
      siteId: spec.site,
      contractType: spec.contractType,
      workOrderNo: conv.workOrderNo,
      workOrderDate: conv.loaDate,
      billingCycle: spec.billing,
      paymentTermsDays: spec.paymentTermsDays,
      tenderId: conv.tenderId,
      organisationId: conv.organisationId,
      regionId: conv.regionId,
      gstRegistrationId: conv.gstId,
      contractValue,
      startDate,
      plannedEndDate: endDate,
      statusId: completed ? "pst_completed" : "pst_progress",
      projectManagerId: employeeIdOfUser(spec.pm),
      healthOverride: null,
    });

    const tender = db.tenders.find((t) => t.id === conv.tenderId)!;
    db.projectConversions.push({
      ...meta(`conv_${spec.key}`), tenderId: conv.tenderId, projectId: id, convertedById: userId("stalin"), convertedAt: at(conv.convertedDate, "12:30"),
      snapshot: { tenderNo: tender.tenderNo, estimatedValue: tender.estimatedValue, awardedAmount: conv.awardedAmount, workOrderNo: conv.workOrderNo, loaDate: conv.loaDate, agreementDate: conv.agreementDate },
      overrideReason: null, approvalRequestId: null,
    });
    db.projectMembers.push({ ...meta(`pm_${spec.key}`), projectId: id, employeeId: employeeIdOfUser(spec.pm), roleLabel: "Project Manager", fromDate: startDate, toDate: null });

    // ---- BOQ: items sum exactly to the contract value (last row is a lump-sum balancing item) ----
    const items = BOQ[spec.template];
    const valuePaise = toPaise(contractValue);
    const rows: { name: string; unit: string; qty: number; ratePaise: bigint; amountPaise: bigint; ls: boolean; share: number }[] = [];
    let used = BigInt(0);
    items.forEach((it) => {
      const qty = Math.max(1, Math.round(((Number(valuePaise) / 100) * it.share) / it.rate));
      const ratePaise = BigInt(it.rate * 100);
      const amountPaise = ratePaise * BigInt(qty);
      used += amountPaise;
      rows.push({ name: it.name, unit: it.unit, qty, ratePaise, amountPaise, ls: false, share: it.share });
    });
    const remainder = valuePaise - used;
    rows.push({
      name: "Mobilisation, safety, statutory compliance and miscellaneous", unit: "LS", qty: 1, ratePaise: remainder, amountPaise: remainder, ls: true,
      share: Number(remainder) / Number(valuePaise),
    });

    const norm = rows.reduce((acc, r, i) => acc + r.share * PACE[i % PACE.length], 0);
    rows.forEach((r, i) => {
      const frac = completed ? 1 : Math.min(1, Math.max(0, ((actualPct / 100) * PACE[i % PACE.length]) / norm));
      const executed = r.ls ? frac : Math.round(r.qty * frac);
      db.boqItems.push({
        ...meta(`boq_${spec.key}_${i + 1}`), projectId: id, itemNo: `${i + 1}`, description: r.name, unit: r.unit, quantity: r.qty.toFixed(3),
        rate: fromPaise(r.ratePaise), amount: fromPaise(r.amountPaise), executedQty: executed.toFixed(3),
      });
    });

    // ---- Monthly progress history (planned vs actual), for charts ----
    const elapsedToday = Math.max(1, Math.min(daysBetween(startDate, DEMO_TODAY), total));
    const lastDate = endDate < DEMO_TODAY ? endDate : DEMO_TODAY;
    const checkpoints: string[] = [];
    for (let d = addDays(startDate, 30); d < lastDate; d = addDays(d, 30)) checkpoints.push(d);
    checkpoints.push(lastDate);
    // One snapshot per calendar month: the last checkpoint in that month wins.
    const byMonth = new Map<string, { planned: number; actual: number }>();
    checkpoints.forEach((d) => {
      const elapsed = Math.min(daysBetween(startDate, d), total);
      const planned = Math.min(100, (elapsed / total) * 100);
      const actual = completed && d === lastDate ? 100 : Math.max(0, planned - spec.lag * (elapsed / elapsedToday));
      byMonth.set(monthOf(d), { planned, actual });
    });
    byMonth.forEach((v, month) =>
      db.progressSnapshots.push({
        ...meta(`ps_${spec.key}_${month}`), projectId: id, month, plannedPct: v.planned.toFixed(4), actualPct: v.actual.toFixed(4),
      }),
    );

    infos.push({
      key: spec.key, id, regionKey: site.region, regionId: RegionKey[site.region], gstId: conv.gstId, organisationId: conv.organisationId, siteId: spec.site,
      stateId: site.state, contractValue, startDate, endDate, pmKey: spec.pm, template: spec.template, billing: spec.billing, paymentTermsDays: spec.paymentTermsDays,
      actualPct, expectedPct, tenderId: conv.tenderId, completed,
    });
  });

  return infos;
}
