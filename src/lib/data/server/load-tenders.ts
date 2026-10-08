import type * as P from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { Database, Tender, TenderStage, TenderResult, TenderType, TenderPortal, TenderStageHistory, GoNoGoDecision, TenderDocumentItem, SecurityInstrument, SecurityInstrumentEvent, Bid, BidClarification, CompetitorBid, TenderAward, AwardCondition, ProjectConversion } from "@/types";
import { base, day, dayOrNull, inIds, parentIn, money, moneyOrNull, pct, ts, tsOrNull, liveWhere, type LoadScope } from "./convert";

export const mapTender = (r: P.Tender): Tender => ({
  ...base(r),
  tenderNo: r.tenderNo, title: r.title, workDescription: r.workDescription, eligibility: r.eligibility,
  serviceLineId: r.serviceLineId, siteId: r.siteId, openingDate: day(r.openingDate),
  organisationId: r.organisationId, regionId: r.regionId, location: r.location, tenderTypeId: r.tenderTypeId,
  portalId: r.portalId, sourceUrl: r.sourceUrl,
  estimatedValue: money(r.estimatedValue), emdAmount: money(r.emdAmount), tenderFee: money(r.tenderFee),
  publishedOn: dayOrNull(r.publishedOn), preBidAt: tsOrNull(r.preBidAt),
  submissionDeadlineAt: ts(r.submissionDeadlineAt), technicalOpeningAt: tsOrNull(r.technicalOpeningAt),
  financialOpeningAt: tsOrNull(r.financialOpeningAt),
  currentStageId: r.currentStageId, resultId: r.resultId, ownerId: r.ownerId, gstRegistrationId: r.gstRegistrationId,
});

export const mapStageHistory = (r: P.TenderStageHistory): TenderStageHistory => ({
  ...base(r), tenderId: r.tenderId, fromStageId: r.fromStageId, toStageId: r.toStageId,
  changedById: r.changedById, changedAt: ts(r.changedAt), reason: r.reason,
});

export const mapGoNoGo = (r: P.GoNoGoDecision): GoNoGoDecision => ({
  ...base(r), tenderId: r.tenderId, decision: r.decision, decidedById: r.decidedById,
  decidedAt: ts(r.decidedAt), reason: r.reason, approvalRequestId: r.approvalRequestId,
});

export const mapDocumentItem = (r: P.TenderDocumentItem): TenderDocumentItem => ({
  ...base(r), tenderId: r.tenderId, name: r.name, documentTypeId: r.documentTypeId, isMandatory: r.isMandatory,
  status: r.status, assigneeId: r.assigneeId, dueDate: dayOrNull(r.dueDate),
});

export const mapInstrument = (r: P.SecurityInstrument): SecurityInstrument => ({
  ...base(r), type: r.type, tenderId: r.tenderId, projectId: r.projectId, mode: r.mode, amount: money(r.amount),
  instrumentNo: r.instrumentNo, bank: r.bank, issueDate: dayOrNull(r.issueDate), expiryDate: dayOrNull(r.expiryDate),
  status: r.status,
});

export const mapInstrumentEvent = (r: P.SecurityInstrumentEvent): SecurityInstrumentEvent => ({
  ...base(r), securityInstrumentId: r.securityInstrumentId, type: r.type, amount: moneyOrNull(r.amount),
  date: day(r.date), reference: r.reference,
});

export const mapBid = (r: P.Bid): Bid => ({
  ...base(r), tenderId: r.tenderId, quotedAmount: money(r.quotedAmount), percentVsEstimate: pct(r.percentVsEstimate),
  submittedAt: tsOrNull(r.submittedAt), technicalResult: r.technicalResult, financialRank: r.financialRank,
  isL1: r.isL1, isFinal: r.isFinal,
});

export const mapBidClarification = (r: P.BidClarification): BidClarification => ({
  ...base(r), bidId: r.bidId, request: r.request, requestedOn: day(r.requestedOn), dueDate: dayOrNull(r.dueDate),
  response: r.response, respondedOn: dayOrNull(r.respondedOn),
});

export const mapCompetitorBid = (r: P.CompetitorBid): CompetitorBid => ({
  ...base(r), tenderId: r.tenderId, competitorName: r.competitorName, amount: money(r.amount), rank: r.rank, isL1: r.isL1,
});

export const mapAward = (r: P.TenderAward): TenderAward => ({
  ...base(r), tenderId: r.tenderId, loaNo: r.loaNo, loaDate: day(r.loaDate), awardedAmount: money(r.awardedAmount),
  agreementNo: r.agreementNo, agreementDate: dayOrNull(r.agreementDate), completionPeriodDays: r.completionPeriodDays,
  startDate: dayOrNull(r.startDate), conditionsNote: r.conditionsNote,
});

export const mapAwardCondition = (r: P.AwardCondition): AwardCondition => ({
  ...base(r), awardId: r.awardId, description: r.description, isMandatory: r.isMandatory, status: r.status,
  dueDate: dayOrNull(r.dueDate),
});

export const mapConversion = (r: P.ProjectConversion): ProjectConversion => ({
  ...base(r), tenderId: r.tenderId, projectId: r.projectId, convertedById: r.convertedById,
  convertedAt: ts(r.convertedAt), snapshot: (r.snapshot ?? {}) as Record<string, unknown>,
  overrideReason: r.overrideReason, approvalRequestId: r.approvalRequestId,
});

export const mapTenderStage = (r: P.TenderStage): TenderStage => ({
  ...base(r), name: r.name, sequence: r.sequence, kind: r.kind, color: r.color ?? null, systemKey: r.systemKey, isActive: r.isActive,
});
export const mapTenderResult = (r: P.TenderResult): TenderResult => ({ ...base(r), name: r.name, outcome: r.outcome, isActive: r.isActive });
export const mapTenderType = (r: P.TenderType): TenderType => ({ ...base(r), name: r.name, isActive: r.isActive });
export const mapTenderPortal = (r: P.TenderPortal): TenderPortal => ({ ...base(r), name: r.name, url: r.url });

export type TenderTables = Pick<Database, "tenderStages" | "tenderResults" | "tenderTypes" | "tenderPortals" | "tenders" | "tenderStageHistory" | "goNoGoDecisions" | "tenderDocumentItems" | "securityInstruments" | "securityInstrumentEvents" | "bids" | "bidClarifications" | "competitorBids" | "tenderAwards" | "awardConditions" | "projectConversions">;

/**
 * Loads every tender-domain table as `Database` slices. Soft-deleted rows are included (readers use `live()`).
 * Scope: regionIds -> tender.regionId; siteIds -> tender.siteId; projectIds -> tenders converted to those projects.
 * Child tables are restricted to the loaded tenders.
 */
export async function loadTenderTables(prisma: PrismaClient, scope: LoadScope = {}): Promise<TenderTables> {
  const lw = liveWhere(scope);
  const where: P.Prisma.TenderWhereInput = {
    ...lw,
    regionId: inIds(scope.regionIds),
    siteId: inIds(scope.siteIds),
    ...(scope.projectIds ? { project: { is: { id: { in: scope.projectIds } } } } : {}),
  };
  // One round: the child tables only wait for their parents when the scope restricts rows (see parentIn).
  const tendersP = prisma.tender.findMany({ where, orderBy: { id: "asc" } });
  const byTender = parentIn("tenderId", tendersP, scope);
  const forTender = <T,>(run: (w: Record<string, unknown>) => PromiseLike<T>) => byTender.then((f) => run({ ...f, ...lw }));
  const instrumentsP = forTender((w) => prisma.securityInstrument.findMany({ where: w, orderBy: { id: "asc" } }));
  const bidsP = forTender((w) => prisma.bid.findMany({ where: w, orderBy: { id: "asc" } }));
  const awardsP = forTender((w) => prisma.tenderAward.findMany({ where: w, orderBy: { id: "asc" } }));
  const [stages, results, types, portals, tenders, history, decisions, docs, instruments, bids, competitors, awards, conversions, events, clarifications, conditions] = await Promise.all([
    prisma.tenderStage.findMany({ where: lw, orderBy: { sequence: "asc" } }),
    prisma.tenderResult.findMany({ where: lw, orderBy: { id: "asc" } }),
    prisma.tenderType.findMany({ where: lw, orderBy: { id: "asc" } }),
    prisma.tenderPortal.findMany({ where: lw, orderBy: { id: "asc" } }),
    tendersP,
    forTender((w) => prisma.tenderStageHistory.findMany({ where: w, orderBy: { id: "asc" } })),
    forTender((w) => prisma.goNoGoDecision.findMany({ where: w, orderBy: { id: "asc" } })),
    forTender((w) => prisma.tenderDocumentItem.findMany({ where: w, orderBy: { id: "asc" } })),
    instrumentsP,
    bidsP,
    forTender((w) => prisma.competitorBid.findMany({ where: w, orderBy: { id: "asc" } })),
    awardsP,
    forTender((w) => prisma.projectConversion.findMany({ where: w, orderBy: { id: "asc" } })),
    parentIn("securityInstrumentId", instrumentsP, scope).then((f) => prisma.securityInstrumentEvent.findMany({ where: { ...lw, ...f }, orderBy: { id: "asc" } })),
    parentIn("bidId", bidsP, scope).then((f) => prisma.bidClarification.findMany({ where: { ...lw, ...f }, orderBy: { id: "asc" } })),
    parentIn("awardId", awardsP, scope).then((f) => prisma.awardCondition.findMany({ where: { ...lw, ...f }, orderBy: { id: "asc" } })),
  ]);
  return {
    tenderStages: stages.map(mapTenderStage),
    tenderResults: results.map(mapTenderResult),
    tenderTypes: types.map(mapTenderType),
    tenderPortals: portals.map(mapTenderPortal),
    tenders: tenders.map(mapTender),
    tenderStageHistory: history.map(mapStageHistory),
    goNoGoDecisions: decisions.map(mapGoNoGo),
    tenderDocumentItems: docs.map(mapDocumentItem),
    securityInstruments: instruments.map(mapInstrument),
    securityInstrumentEvents: events.map(mapInstrumentEvent),
    bids: bids.map(mapBid),
    bidClarifications: clarifications.map(mapBidClarification),
    competitorBids: competitors.map(mapCompetitorBid),
    tenderAwards: awards.map(mapAward),
    awardConditions: conditions.map(mapAwardCondition),
    projectConversions: conversions.map(mapConversion),
  };
}
