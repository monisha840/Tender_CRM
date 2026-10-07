import { addDays, daysBetween, getToday, toIstDate } from "@/lib/dates";
import { moneyToNumber, sumMoney } from "@/lib/money";
import type {
  Bid,
  Database,
  Id,
  Project,
  ProjectConversion,
  SecurityInstrument,
  Tender,
  TenderAward,
  TenderStage,
  TenderStageKind,
} from "@/types";
import { byId, organisationName, inRegion, regionName, userName, type RegionFilter } from "./shared";

export interface TenderRow {
  tender: Tender;
  organisationName: string;
  /** Short code, e.g. "NTPC", for compact table cells. */
  organisationShort: string;
  regionName: string;
  stage: TenderStage;
  ownerName: string;
  serviceLineName: string;
  bid: Bid | null;
  /** Days from today to the submission deadline (negative when passed). */
  daysToDeadline: number;
}

export interface TenderFilters {
  region?: RegionFilter;
  stageKind?: TenderStageKind;
  stageId?: Id;
  ownerId?: Id;
  search?: string;
}

export function listTenders(db: Database, filters: TenderFilters = {}): TenderRow[] {
  const today = getToday();
  const search = filters.search?.trim().toLowerCase();
  return db.tenders
    .filter((t) => !t.deletedAt && inRegion(filters.region ?? "ALL", t.regionId))
    .map((tender): TenderRow => ({
      tender,
      organisationName: organisationName(db, tender.organisationId),
      organisationShort: byId(db.organisations, tender.organisationId)?.shortName ?? "—",
      regionName: regionName(db, tender.regionId),
      stage: byId(db.tenderStages, tender.currentStageId)!,
      ownerName: userName(db, tender.ownerId),
      serviceLineName: byId(db.serviceLines, tender.serviceLineId)?.name ?? "—",
      bid: db.bids.find((b) => b.tenderId === tender.id && b.isFinal) ?? null,
      daysToDeadline: daysBetween(today, toIstDate(tender.submissionDeadlineAt)),
    }))
    .filter((r) => !filters.stageKind || r.stage.kind === filters.stageKind)
    .filter((r) => !filters.stageId || r.stage.id === filters.stageId)
    .filter((r) => !filters.ownerId || r.tender.ownerId === filters.ownerId)
    .filter(
      (r) =>
        !search ||
        r.tender.title.toLowerCase().includes(search) ||
        r.tender.tenderNo.toLowerCase().includes(search) ||
        r.organisationName.toLowerCase().includes(search),
    )
    .sort((a, b) => a.tender.submissionDeadlineAt.localeCompare(b.tender.submissionDeadlineAt));
}

export interface TenderDetail extends TenderRow {
  history: { at: string; fromStage: string | null; toStage: string; by: string; reason: string | null }[];
  documents: Database["tenderDocumentItems"];
  instruments: SecurityInstrument[];
  award: TenderAward | null;
  conditions: Database["awardConditions"];
  competitors: Database["competitorBids"];
  clarifications: Database["bidClarifications"];
  decisions: Database["goNoGoDecisions"];
  projectId: Id | null;
}

export function getTender(db: Database, id: Id): TenderDetail | null {
  const row = listTenders(db).find((r) => r.tender.id === id);
  if (!row) return null;
  const award = db.tenderAwards.find((a) => a.tenderId === id) ?? null;
  return {
    ...row,
    history: db.tenderStageHistory
      .filter((h) => h.tenderId === id)
      .sort((a, b) => a.changedAt.localeCompare(b.changedAt))
      .map((h) => ({
        at: h.changedAt,
        fromStage: byId(db.tenderStages, h.fromStageId)?.name ?? null,
        toStage: byId(db.tenderStages, h.toStageId)?.name ?? "—",
        by: userName(db, h.changedById),
        reason: h.reason ?? null,
      })),
    documents: db.tenderDocumentItems.filter((d) => d.tenderId === id),
    instruments: db.securityInstruments.filter((s) => s.tenderId === id),
    award,
    conditions: award ? db.awardConditions.filter((c) => c.awardId === award.id) : [],
    competitors: db.competitorBids.filter((c) => c.tenderId === id).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)),
    clarifications: db.bidClarifications.filter((c) => db.bids.some((b) => b.id === c.bidId && b.tenderId === id)),
    decisions: db.goNoGoDecisions.filter((d) => d.tenderId === id),
    projectId: db.projects.find((p) => p.tenderId === id)?.id ?? null,
  };
}

export interface PipelineStage {
  stage: TenderStage;
  count: number;
  /** Sum of government estimates, in rupees (chart use). */
  value: number;
}

/** Open pipeline by stage, in stage order, for the funnel / bar chart. */
export function getTenderPipeline(db: Database, region: RegionFilter = "ALL"): PipelineStage[] {
  const rows = listTenders(db, { region });
  return db.tenderStages
    .filter((s) => s.isActive && s.kind === "OPEN")
    .sort((a, b) => a.sequence - b.sequence)
    .map((stage) => {
      const inStage = rows.filter((r) => r.stage.id === stage.id);
      return { stage, count: inStage.length, value: moneyToNumber(sumMoney(inStage.map((r) => r.tender.estimatedValue))) };
    });
}

export interface TenderStats {
  activeCount: number;
  activeValue: number;
  wonCount: number;
  lostCount: number;
  /** 0–100, or null when nothing has been decided yet. */
  winRate: number | null;
  wonValue: number;
  lostValue: number;
  pendingGoNoGo: number;
}

export function getTenderStats(db: Database, region: RegionFilter = "ALL"): TenderStats {
  const rows = listTenders(db, { region });
  const active = rows.filter((r) => r.stage.kind === "OPEN");
  const won = rows.filter((r) => r.stage.kind === "WON");
  const lost = rows.filter((r) => r.stage.kind === "LOST");
  const value = (rs: TenderRow[]) => moneyToNumber(sumMoney(rs.map((r) => r.bid?.quotedAmount ?? r.tender.estimatedValue)));
  return {
    activeCount: active.length,
    activeValue: moneyToNumber(sumMoney(active.map((r) => r.tender.estimatedValue))),
    wonCount: won.length,
    lostCount: lost.length,
    winRate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
    wonValue: value(won),
    lostValue: value(lost),
    pendingGoNoGo: rows.filter((r) => r.stage.systemKey === "UNDER_EVALUATION").length,
  };
}

/** Open tenders with a submission deadline in the next `withinDays` days, soonest first. */
export function getUpcomingDeadlines(db: Database, region: RegionFilter = "ALL", withinDays = 14): TenderRow[] {
  const submitted = new Set(["SUBMITTED"]);
  return listTenders(db, { region, stageKind: "OPEN" })
    .filter((r) => r.daysToDeadline >= 0 && r.daysToDeadline <= withinDays && !submitted.has(r.stage.systemKey ?? ""))
    .sort((a, b) => a.daysToDeadline - b.daysToDeadline);
}

/** Won vs lost value per financial quarter-ish bucket (by submission month), for a bar chart. */
export function getWonLostByMonth(db: Database, region: RegionFilter = "ALL") {
  const buckets = new Map<string, { month: string; won: number; lost: number }>();
  listTenders(db, { region }).forEach((r) => {
    if (r.stage.kind !== "WON" && r.stage.kind !== "LOST") return;
    const month = toIstDate(r.tender.submissionDeadlineAt).slice(0, 7);
    const entry = buckets.get(month) ?? { month, won: 0, lost: 0 };
    const v = moneyToNumber(r.bid?.quotedAmount ?? r.tender.estimatedValue);
    if (r.stage.kind === "WON") entry.won += v;
    else entry.lost += v;
    buckets.set(month, entry);
  });
  return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** EMD / PBG money currently tied up. */
export function getSecuritiesSummary(db: Database, region: RegionFilter = "ALL") {
  const tenderRegion = new Map(db.tenders.map((t) => [t.id, t.regionId]));
  const scoped = db.securityInstruments.filter((s) => inRegion(region, tenderRegion.get(s.tenderId)));
  const open = (type: SecurityInstrument["type"], statuses: SecurityInstrument["status"][]) =>
    scoped.filter((s) => s.type === type && statuses.includes(s.status));
  const emd = open("EMD", ["ARRANGED", "SUBMITTED"]);
  const pbg = open("PBG", ["ARRANGED", "SUBMITTED"]);
  return {
    emdLocked: sumMoney(emd.map((s) => s.amount)),
    emdCount: emd.length,
    pbgOutstanding: sumMoney(pbg.map((s) => s.amount)),
    pbgCount: pbg.length,
  };
}

// ---- Register screen helpers ------------------------------------------------

/** Stage tabs for the status count bar, in stage order, each with how many of `rows` are in it. */
export function getStageCounts(db: Database, rows: TenderRow[]) {
  return db.tenderStages
    .filter((s) => s.isActive)
    .sort((a, b) => a.sequence - b.sequence)
    .map((stage) => ({ stage, count: rows.filter((r) => r.stage.id === stage.id).length }));
}

/** Documents on a tender that are mandatory and not yet ready (feeds the "missing" warning). */
export const missingMandatoryDocs = (docs: TenderDetail["documents"]) =>
  docs.filter((d) => d.isMandatory && d.status !== "READY" && d.status !== "NA");

/** Reminder bands from the default 7 / 3 / 1 day schedule (CLAUDE.md → Notifications). */
export function reminderBand(daysToDeadline: number): 1 | 3 | 7 | null {
  if (daysToDeadline < 0) return null;
  if (daysToDeadline <= 1) return 1;
  if (daysToDeadline <= 3) return 3;
  if (daysToDeadline <= 7) return 7;
  return null;
}

// ---- Convert to project -----------------------------------------------------

export interface ConversionCheck {
  ok: boolean;
  /** Why the action is unavailable (shown instead of the button). */
  blocker: string | null;
  /** Mandatory award conditions still open: converting then needs a reason. */
  unmetConditions: string[];
  siteId: Id | null;
}

export function checkConversion(db: Database, d: TenderDetail): ConversionCheck {
  const unmetConditions = d.conditions.filter((c) => c.isMandatory && c.status === "PENDING").map((c) => c.description);
  if (d.stage.kind !== "WON") return { ok: false, blocker: "Only a Won tender can be converted.", unmetConditions, siteId: null };
  if (d.projectId) return { ok: false, blocker: "Already converted to a project.", unmetConditions, siteId: null };
  const siteId =
    d.tender.siteId ??
    db.sites.find((s) => s.organisationId === d.tender.organisationId && s.regionId === d.tender.regionId)?.id ??
    null;
  if (!siteId) return { ok: false, blocker: "No plant site is linked to this tender, so a project cannot be placed.", unmetConditions, siteId };
  return { ok: true, blocker: null, unmetConditions, siteId };
}

/**
 * Builds the rows a conversion writes: the project (carrying the tender's organisation, region, GSTIN,
 * value and dates), the provenance record, and the PBG moved onto the project. Nothing is saved here.
 */
export function buildConversion(db: Database, d: TenderDetail, userId: Id, overrideReason: string | null) {
  const check = checkConversion(db, d);
  if (!check.ok || !check.siteId) throw new Error(check.blocker ?? "Cannot convert");
  const today = getToday();
  const now = new Date(`${today}T06:30:00.000Z`).toISOString(); // 12:00 IST on the demo day
  const t = d.tender;
  const region = byId(db.regions, t.regionId);
  const contractValue = d.award?.awardedAmount ?? d.bid?.quotedAmount ?? t.estimatedValue;
  const isService = (byId(db.tenderTypes, t.tenderTypeId)?.name ?? "").toLowerCase().includes("service");
  const startDate = d.award?.startDate ?? addDays(today, 7);
  const nextNo = db.projects.filter((p) => p.regionId === t.regionId).length + 1;
  const projectId = `prj_${t.id.replace(/^tnd_/, "")}`;
  const meta = { createdAt: now, updatedAt: now, deletedAt: null };

  const project: Project = {
    ...meta,
    id: projectId,
    code: `SPH-${region?.code ?? "GEN"}-${String(nextNo).padStart(2, "0")}`,
    name: t.title,
    serviceLineId: t.serviceLineId,
    siteId: check.siteId,
    contractType: isService ? "SERVICE" : "FIXED_SCOPE",
    workOrderNo: d.award?.loaNo ?? t.tenderNo,
    workOrderDate: d.award?.loaDate ?? today,
    billingCycle: isService ? "MONTHLY" : "MILESTONE",
    paymentTermsDays: 30,
    tenderId: t.id,
    organisationId: t.organisationId,
    regionId: t.regionId,
    gstRegistrationId: t.gstRegistrationId ?? "",
    contractValue,
    startDate,
    plannedEndDate: addDays(startDate, d.award?.completionPeriodDays ?? 365),
    statusId: "pst_mobilisation",
    projectManagerId: null,
    healthOverride: null,
  };
  const conversion: ProjectConversion = {
    ...meta,
    id: `conv_${projectId}`,
    tenderId: t.id,
    projectId,
    convertedById: userId,
    convertedAt: now,
    snapshot: {
      tenderNo: t.tenderNo,
      estimatedValue: t.estimatedValue,
      awardedAmount: contractValue,
      workOrderNo: project.workOrderNo,
      loaDate: d.award?.loaDate ?? null,
      agreementDate: d.award?.agreementDate ?? null,
    },
    overrideReason,
    approvalRequestId: null,
  };
  const instruments = d.instruments.filter((s) => s.type === "PBG").map((s) => ({ ...s, projectId, updatedAt: now }));
  return { project, conversion, instruments };
}
