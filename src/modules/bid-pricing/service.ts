import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { assertCan } from "@/lib/server/permissions";
import { rateOn, getSettingValue } from "@/lib/server/settings-read";
import { runAction, ServiceError } from "@/lib/server/service";
import { averageMarginPct, computePricing, dailyFromRate, type PricingResult } from "./calc";
import { loadBenchmarks, type PnlBenchmarkRow } from "./benchmarks";
import { isModuleEnabled } from "./feature";
import { pricingContextSchema, savePricingSchema } from "./schema";

const MODULE = "bid_pricing";

type RateDb = Parameters<typeof rateOn>[3];

export interface RateInfo {
  value: string;
  unit: string;
  effectiveFrom: string;
  sourceNote: string | null;
}
export interface PricingRates {
  /** Minimum wage per day (monthly rates are divided by 26). */
  minWage: (RateInfo & { perDay: string }) | null;
  pf: RateInfo | null;
  esi: RateInfo | null;
  bonus: RateInfo | null;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

function info(r: Awaited<ReturnType<typeof rateOn>>): RateInfo | null {
  return r ? { value: r.value.toString(), unit: r.unit, effectiveFrom: isoDay(r.effectiveFrom), sourceNote: r.sourceNote } : null;
}

/**
 * Statutory rates valid ON `date` (rate-by-date: a later revision never rewrites an earlier tender's maths).
 * MIN_WAGE narrows by category and region; PF/ESI/bonus employer shares are generic.
 */
export async function loadPricingRates(date: Date, opts: { category?: string | null; regionId?: string | null }, db?: RateDb): Promise<PricingRates> {
  const narrow = { category: opts.category ?? null, regionId: opts.regionId ?? null };
  const [mw, pf, esi, bonus] = await Promise.all([
    rateOn("MIN_WAGE", date, narrow, db),
    rateOn("PF_EMPLOYER", date, {}, db),
    rateOn("ESI_EMPLOYER", date, {}, db),
    rateOn("BONUS", date, {}, db),
  ]);
  const pctOnly = (r: typeof pf) => (r && r.unit === "PERCENT" ? info(r) : null);
  return {
    minWage: mw ? { ...info(mw)!, perDay: dailyFromRate(mw.value, mw.unit) } : null,
    pf: pctOnly(pf),
    esi: pctOnly(esi),
    bonus: pctOnly(bonus),
  };
}

export interface SavedPricing {
  inputs: Record<string, unknown>;
  result: PricingResult;
  updatedAt: string;
}

export interface PricingContext {
  tender: {
    id: string;
    tenderNo: string;
    title: string;
    organisationName: string;
    serviceLineId: string;
    serviceLineName: string;
    regionId: string;
    regionName: string;
    estimatedValue: string;
    rateDate: string;
  };
  rates: PricingRates;
  /** Wage categories that have a MIN_WAGE rate on file. */
  categories: string[];
  defaults: { overheadPct: number; marginPct: number };
  saved: SavedPricing | null;
  benchmarks: { rows: PnlBenchmarkRow[]; avgMarginPct: number | null };
}

function splitSaved(stored: Prisma.JsonValue, updatedAt: Date): SavedPricing {
  const { result, ...inputs } = stored as Record<string, unknown>;
  return { inputs, result: result as PricingResult, updatedAt: updatedAt.toISOString() };
}

export async function getPricingContext(tenderId: string, opts: { category?: string | null; rateDate?: string | null } = {}): Promise<PricingContext> {
  const tender = await prisma.tender.findFirst({
    where: { id: tenderId, deletedAt: null },
    select: {
      id: true, tenderNo: true, title: true, estimatedValue: true, openingDate: true, regionId: true, serviceLineId: true,
      organisation: { select: { name: true } }, serviceLine: { select: { name: true } }, region: { select: { name: true } },
    },
  });
  if (!tender) throw new ServiceError("NOT_FOUND", "Tender not found");
  const rateDate = opts.rateDate ?? isoDay(tender.openingDate);
  const [rates, cats, saved, overheadPct, marginPct, rows] = await Promise.all([
    loadPricingRates(asDate(rateDate), { category: opts.category, regionId: tender.regionId }),
    prisma.statutoryRate.findMany({ where: { code: "MIN_WAGE", isActive: true, deletedAt: null, category: { not: null } }, select: { category: true }, distinct: ["category"] }),
    prisma.tenderPricing.findFirst({ where: { tenderId, deletedAt: null } }),
    getSettingValue<number>("bid.overheadPct", 8),
    getSettingValue<number>("bid.marginPct", 10),
    loadBenchmarks({ serviceLineId: tender.serviceLineId, regionId: tender.regionId }),
  ]);
  return {
    tender: {
      id: tender.id, tenderNo: tender.tenderNo, title: tender.title, organisationName: tender.organisation.name,
      serviceLineId: tender.serviceLineId, serviceLineName: tender.serviceLine.name, regionId: tender.regionId, regionName: tender.region.name,
      estimatedValue: tender.estimatedValue.toFixed(2), rateDate,
    },
    rates,
    categories: cats.map((c) => c.category!).sort(),
    defaults: { overheadPct: Number(overheadPct) || 0, marginPct: Number(marginPct) || 0 },
    saved: saved ? splitSaved(saved.inputs, saved.updatedAt) : null,
    benchmarks: { rows, avgMarginPct: averageMarginPct(rows) },
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function buildPricingActions() {
  const context = runAction({ schema: pricingContextSchema, module: MODULE, action: "VIEW" }, async ({ input }) => {
    if (!(await isModuleEnabled(MODULE))) throw new ServiceError("NOT_FOUND", "Bid pricing is switched off in Settings.");
    return getPricingContext(input.tenderId, { category: input.category, rateDate: input.rateDate });
  });

  const save = runAction({ schema: savePricingSchema, module: MODULE, action: "EDIT" }, async ({ tx, user, input, audit }) => {
    if (!(await isModuleEnabled(MODULE))) throw new ServiceError("NOT_FOUND", "Bid pricing is switched off in Settings.");
    const tender = await tx.tender.findFirst({
      where: { id: input.tenderId, deletedAt: null },
      select: { id: true, tenderNo: true, regionId: true, serviceLineId: true, openingDate: true },
    });
    if (!tender) throw new ServiceError("NOT_FOUND", "Tender not found");
    const existing = await tx.tenderPricing.findUnique({ where: { tenderId: tender.id } });
    if (!existing) await assertCan(user, MODULE, "CREATE");

    const rateDate = input.rateDate ?? isoDay(tender.openingDate);
    const rates = await loadPricingRates(asDate(rateDate), { category: input.wageCategory, regionId: tender.regionId }, tx as unknown as RateDb);
    // The server is the authority on the statutory minimum wage; the client value is never trusted.
    if (!rates.minWage) {
      throw new ServiceError("VALIDATION", `No minimum wage rate (MIN_WAGE) is on file for ${rateDate}. Add it under Statutory rates first.`);
    }
    const minWagePerDay = rates.minWage.perDay;

    const benchRows = await loadBenchmarks({ serviceLineId: tender.serviceLineId, regionId: tender.regionId });
    const bench = { avgMarginPct: averageMarginPct(benchRows) };
    const quoted = input.quotedPrice ? input.quotedPrice : null;
    const result = computePricing(
      {
        manpower: input.manpower, days: input.days, minWagePerDay, dailyWage: input.dailyWage || null,
        pfPct: input.pfPct, esiPct: input.esiPct, bonusPct: input.bonusPct, esiApplicable: input.esiApplicable,
        overheadPct: input.overheadPct, marginPct: input.marginPct, quotedPrice: quoted,
      },
      bench,
    );

    const inputs = { ...input, rateDate, minWagePerDay, rateSources: { minWage: rates.minWage.sourceNote, effectiveFrom: rates.minWage.effectiveFrom }, result };
    const data = {
      inputs: inputs as unknown as Prisma.InputJsonValue,
      statutoryWageCost: result.statutoryWageCost,
      totalCost: result.totalCost,
      minSafeBid: result.minSafeBid,
      quotedPrice: result.quotedPrice,
      marginAtQuote: result.marginAtQuote,
      marginPctAtQuote: result.marginPctAtQuote,
      warnings: result.warnings as unknown as Prisma.InputJsonValue,
      calculatedById: user.id,
      updatedById: user.id,
      deletedAt: null,
    };
    const row = existing
      ? await tx.tenderPricing.update({ where: { tenderId: tender.id }, data: { ...data, version: { increment: 1 } } })
      : await tx.tenderPricing.create({ data: { tenderId: tender.id, createdById: user.id, ...data } });

    const brief = (r: { totalCost: Prisma.Decimal | string; minSafeBid: Prisma.Decimal | string; quotedPrice: Prisma.Decimal | string | null }) => ({
      totalCost: r.totalCost.toString(), minSafeBid: r.minSafeBid.toString(), quotedPrice: r.quotedPrice?.toString() ?? null,
    });
    await audit({
      action: existing ? "bid_pricing.save" : "bid_pricing.create",
      entityType: "TenderPricing",
      entityId: row.id,
      before: existing ? brief(existing) : undefined,
      after: brief(row),
      summary: `Bid pricing saved for tender ${tender.tenderNo}: cost ${result.totalCost}, minimum safe bid ${result.minSafeBid}${result.warnings.length ? `, ${result.warnings.length} warning(s)` : ""}`,
      regionId: tender.regionId,
    });
    return { result };
  });

  return { context, save };
}

// ---------------------------------------------------------------------------
// Reads for the list page
// ---------------------------------------------------------------------------

export interface PricingListRow {
  tenderId: string;
  tenderNo: string;
  title: string;
  organisationName: string;
  estimatedValue: string;
  quotedPrice: string | null;
  totalCost: string | null;
  minSafeBid: string | null;
  marginPctAtQuote: string | null;
  warningCount: number;
  priced: boolean;
}

/** Open (not yet decided) tenders with their saved pricing, if any. */
export async function listPricingRows(): Promise<PricingListRow[]> {
  const tenders = await prisma.tender.findMany({
    where: { deletedAt: null, currentStage: { kind: "OPEN" } },
    orderBy: { submissionDeadlineAt: "asc" },
    take: 200,
    select: { id: true, tenderNo: true, title: true, estimatedValue: true, organisation: { select: { name: true } } },
  });
  const pricing = await prisma.tenderPricing.findMany({ where: { tenderId: { in: tenders.map((t) => t.id) }, deletedAt: null } });
  const byTender = new Map(pricing.map((p) => [p.tenderId, p]));
  return tenders.map((t) => {
    const p = byTender.get(t.id);
    return {
      tenderId: t.id, tenderNo: t.tenderNo, title: t.title, organisationName: t.organisation.name, estimatedValue: t.estimatedValue.toFixed(2),
      quotedPrice: p?.quotedPrice?.toFixed(2) ?? null, totalCost: p?.totalCost.toFixed(2) ?? null, minSafeBid: p?.minSafeBid.toFixed(2) ?? null,
      marginPctAtQuote: p?.marginPctAtQuote?.toString() ?? null, warningCount: Array.isArray(p?.warnings) ? (p!.warnings as unknown[]).length : 0, priced: !!p,
    };
  });
}
