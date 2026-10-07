// Server-only: never import from client components.
import { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/server/auth-types";
import { writeAudit, type Tx } from "@/lib/server/audit";
import { runAction, ServiceError, updateWithVersion, type UserResolver } from "@/lib/server/service";
import { addDays, istToUtc, toIstDate } from "@/lib/dates";
import { submitForApproval } from "@/modules/approvals/service";
import {
  conversionRequestSchema,
  createTenderSchema,
  deleteTenderSchema,
  goNoGoRequestSchema,
  moveStageSchema,
  resultSchema,
  updateTenderSchema,
} from "./schema";

/**
 * Tender business logic. Every write runs inside `runAction` (permission + one transaction + audit). The approval
 * handlers at the bottom (`applyGoNoGoDecision`, `convertTenderToProject`) run inside the Director's `decide`
 * transaction, registered in `src/modules/approvals/register-handlers.ts`.
 */

export const GO_NO_GO_ENTITY = "TENDER_GO_NO_GO";
export const CONVERSION_ENTITY = "TENDER_CONVERSION";

const todayIst = () => toIstDate(new Date().toISOString());
const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const tenderSnapshot = (t: {
  tenderNo: string; title: string; organisationId: string; serviceLineId: string; regionId: string; tenderTypeId: string;
  location: string; workDescription: string; estimatedValue: Prisma.Decimal; emdAmount: Prisma.Decimal; tenderFee: Prisma.Decimal;
  submissionDeadlineAt: Date; openingDate: Date; ownerId: string; currentStageId: string; resultId: string | null;
}) => ({
  tenderNo: t.tenderNo, title: t.title, organisationId: t.organisationId, serviceLineId: t.serviceLineId, regionId: t.regionId,
  tenderTypeId: t.tenderTypeId, location: t.location, workDescription: t.workDescription,
  estimatedValue: t.estimatedValue.toFixed(2), emdAmount: t.emdAmount.toFixed(2), tenderFee: t.tenderFee.toFixed(2),
  submissionDeadlineAt: t.submissionDeadlineAt.toISOString(), openingDate: t.openingDate.toISOString().slice(0, 10),
  ownerId: t.ownerId, currentStageId: t.currentStageId, resultId: t.resultId,
});

// ---------------------------------------------------------------------------
// Lookups shared by the actions and the approval handlers
// ---------------------------------------------------------------------------

async function activeStages(tx: Tx) {
  return tx.tenderStage.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { sequence: "asc" } });
}

async function loadTender(tx: Tx, id: string) {
  const t = await tx.tender.findFirst({ where: { id, deletedAt: null } });
  if (!t) throw new ServiceError("NOT_FOUND", "Tender not found. It may have been removed.");
  return t;
}

async function assertNoDuplicate(tx: Tx, organisationId: string, tenderNo: string, excludeId?: string) {
  const dup = await tx.tender.findFirst({
    where: { organisationId, tenderNo: { equals: tenderNo, mode: "insensitive" }, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (dup) throw new ServiceError("CONFLICT", `Tender no '${tenderNo}' already exists for this organisation`);
}

async function assertMasters(tx: Tx, v: { organisationId: string; serviceLineId: string; regionId: string; tenderTypeId: string; ownerId: string }) {
  const [org, line, region, type, owner] = await Promise.all([
    tx.organisation.findFirst({ where: { id: v.organisationId, deletedAt: null }, select: { id: true } }),
    tx.serviceLine.findFirst({ where: { id: v.serviceLineId, isActive: true, deletedAt: null }, select: { id: true } }),
    tx.region.findFirst({ where: { id: v.regionId, isActive: true, deletedAt: null }, select: { id: true } }),
    tx.tenderType.findFirst({ where: { id: v.tenderTypeId, isActive: true, deletedAt: null }, select: { id: true } }),
    tx.user.findFirst({ where: { id: v.ownerId, isActive: true, deletedAt: null }, select: { id: true } }),
  ]);
  if (!org) throw new ServiceError("VALIDATION", "Organisation not found");
  if (!line) throw new ServiceError("VALIDATION", "Service line not found");
  if (!region) throw new ServiceError("VALIDATION", "Region not found");
  if (!type) throw new ServiceError("VALIDATION", "Tender type not found");
  if (!owner) throw new ServiceError("VALIDATION", "Owner not found");
}

async function defaultGstRegistrationId(tx: Tx, regionId: string): Promise<string | null> {
  const link = await tx.regionGstRegistration.findFirst({ where: { regionId, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { id: "asc" }] });
  return link?.gstRegistrationId ?? null;
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

async function addHistory(tx: Tx, p: { tenderId: string; fromStageId: string | null; toStageId: string; userId: string; reason?: string | null }) {
  await tx.tenderStageHistory.create({
    data: { tenderId: p.tenderId, fromStageId: p.fromStageId, toStageId: p.toStageId, changedById: p.userId, changedAt: new Date(), reason: p.reason ?? null },
  });
}

async function setStage(tx: Tx, tenderId: string, toStageId: string, userId: string, extra: Prisma.TenderUncheckedUpdateManyInput = {}) {
  await tx.tender.updateMany({
    where: { id: tenderId, deletedAt: null },
    data: { currentStageId: toStageId, updatedById: userId, version: { increment: 1 }, ...extra },
  });
}

// ---------------------------------------------------------------------------
// Server actions (built with runAction). `buildTenderActions(getUser)` lets tests inject a user.
// ---------------------------------------------------------------------------

export function buildTenderActions(getUser?: UserResolver) {
  const createTender = runAction({ schema: createTenderSchema, module: "tenders", action: "CREATE", getUser }, async ({ tx, user, input, audit }) => {
    const ownerId = input.ownerId || user.id;
    await assertMasters(tx, { ...input, ownerId });
    await assertNoDuplicate(tx, input.organisationId, input.tenderNo);
    const stage = (await activeStages(tx)).find((s) => s.kind === "OPEN");
    if (!stage) throw new ServiceError("VALIDATION", "No open tender stage is configured");

    const dl = input.submissionDeadline!;
    const submissionDeadlineAt = new Date(istToUtc(dl.date, dl.time));
    const openingDate = dateOnly(input.openingDate?.date ?? dl.date);
    let tender;
    try {
      tender = await tx.tender.create({
        data: {
          tenderNo: input.tenderNo, title: input.title, workDescription: input.workDescription, eligibility: "",
          serviceLineId: input.serviceLineId, organisationId: input.organisationId, regionId: input.regionId,
          location: input.location, tenderTypeId: input.tenderTypeId,
          estimatedValue: input.estimatedValue, emdAmount: input.emdAmount, tenderFee: input.tenderFee,
          publishedOn: dateOnly(todayIst()), submissionDeadlineAt, openingDate,
          currentStageId: stage.id, ownerId, gstRegistrationId: await defaultGstRegistrationId(tx, input.regionId),
          createdById: user.id,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ServiceError("CONFLICT", `Tender no '${input.tenderNo}' already exists for this organisation`);
      throw e;
    }
    await addHistory(tx, { tenderId: tender.id, fromStageId: null, toStageId: stage.id, userId: user.id });
    await audit({
      action: "tender.create", entityType: "Tender", entityId: tender.id, regionId: tender.regionId,
      after: tenderSnapshot(tender), summary: `Registered tender ${tender.tenderNo}`,
    });
    return { id: tender.id, tenderNo: tender.tenderNo };
  });

  const updateTender = runAction({ schema: updateTenderSchema, module: "tenders", action: "EDIT", getUser }, async ({ tx, user, input, audit }) => {
    const before = await loadTender(tx, input.id);
    if (await tx.project.findFirst({ where: { tenderId: before.id }, select: { id: true } })) {
      throw new ServiceError("CONFLICT", "This tender has been converted to a project and can no longer be edited");
    }
    const ownerId = input.ownerId || before.ownerId;
    await assertMasters(tx, { ...input, ownerId });
    await assertNoDuplicate(tx, input.organisationId, input.tenderNo, before.id);
    const dl = input.submissionDeadline!;
    const data = {
      tenderNo: input.tenderNo, title: input.title, workDescription: input.workDescription,
      serviceLineId: input.serviceLineId, organisationId: input.organisationId, regionId: input.regionId,
      location: input.location, tenderTypeId: input.tenderTypeId,
      estimatedValue: input.estimatedValue, emdAmount: input.emdAmount, tenderFee: input.tenderFee,
      submissionDeadlineAt: new Date(istToUtc(dl.date, dl.time)),
      openingDate: dateOnly(input.openingDate?.date ?? dl.date), ownerId, updatedById: user.id,
    };
    try {
      await updateWithVersion(tx.tender, before.id, input.version, data);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ServiceError("CONFLICT", `Tender no '${input.tenderNo}' already exists for this organisation`);
      throw e;
    }
    const after = await tx.tender.findUniqueOrThrow({ where: { id: before.id } });
    await audit({
      action: "tender.update", entityType: "Tender", entityId: before.id, regionId: after.regionId,
      before: tenderSnapshot(before), after: tenderSnapshot(after), reason: input.reason ?? null,
      summary: `Updated tender ${after.tenderNo}`,
    });
    return { id: after.id, version: after.version };
  });

  const deleteTender = runAction({ schema: deleteTenderSchema, module: "tenders", action: "DELETE", getUser }, async ({ tx, user, input, audit }) => {
    const t = await loadTender(tx, input.id);
    if (await tx.project.findFirst({ where: { tenderId: t.id, deletedAt: null }, select: { id: true } })) {
      throw new ServiceError("CONFLICT", "A project was created from this tender, so it cannot be deleted");
    }
    if (await tx.approvalRequest.findFirst({ where: { entityId: t.id, status: "PENDING", deletedAt: null }, select: { id: true } })) {
      throw new ServiceError("CONFLICT", "This tender has a pending approval. Wait for the decision first");
    }
    await updateWithVersion(tx.tender, t.id, input.version, { deletedAt: new Date(), updatedById: user.id });
    await audit({
      action: "tender.delete", entityType: "Tender", entityId: t.id, regionId: t.regionId,
      before: tenderSnapshot(t), reason: input.reason, summary: `Deleted tender ${t.tenderNo}`,
    });
    return { id: t.id };
  });

  /** Move one step along the configured OPEN stage list. Backwards needs a reason; leaving Under Evaluation forwards needs an approved GO. */
  const moveStage = runAction({ schema: moveStageSchema, module: "tenders", action: "EDIT", getUser }, async ({ tx, user, input, audit }) => {
    const t = await loadTender(tx, input.id);
    const stages = await activeStages(tx);
    const from = stages.find((s) => s.id === t.currentStageId);
    const to = stages.find((s) => s.id === input.toStageId);
    if (!from || !to) throw new ServiceError("VALIDATION", "Stage not found");
    if (from.kind !== "OPEN") throw new ServiceError("CONFLICT", `A tender that is ${from.name} cannot be moved to another stage`);
    if (to.kind !== "OPEN") throw new ServiceError("VALIDATION", "Use Mark won or Mark lost to record the result");
    const open = stages.filter((s) => s.kind === "OPEN");
    const step = open.findIndex((s) => s.id === to.id) - open.findIndex((s) => s.id === from.id);
    if (Math.abs(step) !== 1) throw new ServiceError("VALIDATION", "A tender moves one stage at a time");
    if (step < 0) {
      if (!input.reason) throw new ServiceError("VALIDATION", "Moving a tender back needs a reason");
      if (from.systemKey === "SUBMITTED") throw new ServiceError("CONFLICT", "A submitted tender cannot be moved back");
    }
    if (step > 0 && from.systemKey === "UNDER_EVALUATION") {
      const go = await tx.goNoGoDecision.findFirst({ where: { tenderId: t.id, decision: "GO", deletedAt: null } });
      if (!go) throw new ServiceError("CONFLICT", "The Director must approve GO before this tender can move to bid preparation. Request GO / NO-GO first");
    }
    await updateWithVersion(tx.tender, t.id, input.version, { currentStageId: to.id, updatedById: user.id });
    await addHistory(tx, { tenderId: t.id, fromStageId: from.id, toStageId: to.id, userId: user.id, reason: input.reason });
    await audit({
      action: "tender.stage", entityType: "Tender", entityId: t.id, regionId: t.regionId,
      before: { stage: from.name }, after: { stage: to.name }, reason: input.reason ?? null, reasonRequired: step < 0,
      summary: `${t.tenderNo}: ${from.name} to ${to.name}`,
    });
    return { id: t.id, stage: to.name };
  });

  /** Admin proposes GO or NO-GO; the Director decides through the approval engine. */
  const requestGoNoGo = runAction({ schema: goNoGoRequestSchema, module: "tender_go_no_go", action: "SUBMIT", getUser }, async ({ tx, user, input, audit }) => {
    const t = await loadTender(tx, input.id);
    const stage = await tx.tenderStage.findUnique({ where: { id: t.currentStageId } });
    if (stage?.systemKey !== "UNDER_EVALUATION") throw new ServiceError("CONFLICT", "GO / NO-GO can be requested while the tender is Under Evaluation");
    const go = await tx.goNoGoDecision.findFirst({ where: { tenderId: t.id, decision: "GO", deletedAt: null } });
    if (go) throw new ServiceError("CONFLICT", "GO has already been approved for this tender");
    const req = await submitForApproval(tx, user, {
      flowKey: "GO_NO_GO", entityType: GO_NO_GO_ENTITY, entityId: t.id, amount: t.estimatedValue.toFixed(2), regionId: t.regionId,
      summary: `GO / NO-GO (${input.recommendation === "GO" ? "recommend GO" : "recommend NO-GO"}): ${t.title}`,
    });
    await audit({
      action: "tender.go_nogo.request", entityType: "Tender", entityId: t.id, regionId: t.regionId, approvalRequestId: req.id,
      after: { recommendation: input.recommendation, reason: input.reason ?? null }, reason: input.reason ?? null,
      summary: `${t.tenderNo}: ${input.recommendation === "GO" ? "GO" : "NO-GO"} requested`,
    });
    return { requestId: req.id };
  });

  const recordResult = (kind: "WON" | "LOST") =>
    runAction({ schema: resultSchema, module: "tenders", action: "EDIT", reasonRequired: true, getUser }, async ({ tx, user, input, audit }) => {
      const t = await loadTender(tx, input.id);
      const stages = await activeStages(tx);
      const from = stages.find((s) => s.id === t.currentStageId);
      if (from?.systemKey !== "SUBMITTED") throw new ServiceError("CONFLICT", "Only a Submitted tender can be marked Won or Lost");
      const to = stages.find((s) => s.kind === kind);
      if (!to) throw new ServiceError("VALIDATION", `No ${kind === "WON" ? "Won" : "Lost"} stage is configured`);
      const result = await tx.tenderResult.findFirst({ where: { outcome: kind, isActive: true, deletedAt: null }, orderBy: { id: "asc" } });
      await updateWithVersion(tx.tender, t.id, input.version, { currentStageId: to.id, resultId: result?.id ?? null, updatedById: user.id });
      await addHistory(tx, { tenderId: t.id, fromStageId: from.id, toStageId: to.id, userId: user.id, reason: input.reason });
      await audit({
        action: "tender.result", entityType: "Tender", entityId: t.id, regionId: t.regionId,
        before: { stage: from.name }, after: { stage: to.name, result: result?.name ?? null }, reason: input.reason,
        summary: `${t.tenderNo}: marked ${to.name}`,
      });
      return { id: t.id, stage: to.name };
    });
  const markWon = recordResult("WON");
  const markLost = recordResult("LOST");

  /** Admin asks to convert a Won tender into a project; the Director's approval runs the conversion. */
  const requestConversion = runAction({ schema: conversionRequestSchema, module: "tender_conversion", action: "SUBMIT", getUser }, async ({ tx, user, input, audit }) => {
    const check = await checkConversionServer(tx, input.id);
    if (!check.ok) throw new ServiceError("CONFLICT", check.blocker);
    if (check.unmetConditions.length > 0 && !input.overrideReason) {
      throw new ServiceError("VALIDATION", "Mandatory award conditions are still open. Give a reason for converting anyway");
    }
    const t = check.tender;
    const req = await submitForApproval(tx, user, {
      flowKey: "TENDER_CONVERSION", entityType: CONVERSION_ENTITY, entityId: t.id, regionId: t.regionId, amount: check.contractValue,
      summary: `Convert to project: ${t.title}`,
    });
    await audit({
      action: "tender.conversion.request", entityType: "Tender", entityId: t.id, regionId: t.regionId, approvalRequestId: req.id,
      after: { overrideReason: input.overrideReason ?? null, unmetConditions: check.unmetConditions }, reason: input.overrideReason ?? null,
      summary: `${t.tenderNo}: conversion to project requested`,
    });
    return { requestId: req.id };
  });

  return { createTender, updateTender, deleteTender, moveStage, requestGoNoGo, markWon, markLost, requestConversion };
}

// ---------------------------------------------------------------------------
// Conversion (spec: src/lib/data/tenders.ts checkConversion / buildConversion)
// ---------------------------------------------------------------------------

type ConversionCheck =
  | { ok: false; blocker: string }
  | { ok: true; tender: Prisma.TenderGetPayload<object>; siteId: string; gstRegistrationId: string; contractValue: string; unmetConditions: string[] };

/** Server-side `checkConversion`: Won, not yet converted, a plant site and a GSTIN can be resolved. */
export async function checkConversionServer(tx: Tx, tenderId: string): Promise<ConversionCheck> {
  const t = await loadTender(tx, tenderId);
  const [stage, existing, award, bid, pending] = await Promise.all([
    tx.tenderStage.findUnique({ where: { id: t.currentStageId } }),
    tx.project.findFirst({ where: { tenderId: t.id }, select: { id: true } }),
    tx.tenderAward.findFirst({ where: { tenderId: t.id, deletedAt: null }, include: { conditions: { where: { deletedAt: null } } } }),
    tx.bid.findFirst({ where: { tenderId: t.id, isFinal: true, deletedAt: null } }),
    tx.approvalRequest.findFirst({ where: { entityType: CONVERSION_ENTITY, entityId: t.id, status: "PENDING", deletedAt: null }, select: { id: true } }),
  ]);
  if (stage?.kind !== "WON") return { ok: false, blocker: "Only a Won tender can be converted." };
  if (existing) return { ok: false, blocker: "Already converted to a project." };
  if (pending) return { ok: false, blocker: "A conversion request is already waiting for the Director." };
  const siteId =
    t.siteId ??
    (await tx.site.findFirst({ where: { organisationId: t.organisationId, regionId: t.regionId, deletedAt: null }, orderBy: { id: "asc" }, select: { id: true } }))?.id;
  if (!siteId) return { ok: false, blocker: "No plant site is linked to this tender, so a project cannot be placed." };
  const gstRegistrationId = t.gstRegistrationId ?? (await defaultGstRegistrationId(tx, t.regionId));
  if (!gstRegistrationId) return { ok: false, blocker: "No GSTIN is set up for this tender's region, so the project cannot be registered." };
  const unmetConditions = (award?.conditions ?? []).filter((c) => c.isMandatory && c.status === "PENDING").map((c) => c.description);
  const contractValue = (award?.awardedAmount ?? bid?.quotedAmount ?? t.estimatedValue).toFixed(2);
  return { ok: true, tender: t, siteId, gstRegistrationId, contractValue, unmetConditions };
}

async function nextProjectCode(tx: Tx, regionId: string): Promise<string> {
  const region = await tx.region.findUnique({ where: { id: regionId }, select: { code: true } });
  const prefix = `SPH-${region?.code ?? "GEN"}-`;
  const rows = await tx.project.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } }); // deleted included
  let n = 0;
  for (const r of rows) {
    const m = /^\d+$/.exec(r.code.slice(prefix.length));
    if (m) n = Math.max(n, Number(m[0]));
  }
  return `${prefix}${String(n + 1).padStart(2, "0")}`;
}

/** Runs inside the Director's decision transaction: creates the project carrying the tender's data. */
export async function convertTenderToProject(tx: Tx, user: SessionUser, p: { tenderId: string; requestId: string }) {
  // The request is already APPROVED here (decide marks it before calling the handler), so it is not a pending blocker.
  const check = await checkConversionServer(tx, p.tenderId);
  if (!check.ok) throw new ServiceError("CONFLICT", check.blocker);
  const t = check.tender;

  const [award, bid, type, status] = await Promise.all([
    tx.tenderAward.findFirst({ where: { tenderId: t.id, deletedAt: null } }),
    tx.bid.findFirst({ where: { tenderId: t.id, isFinal: true, deletedAt: null } }),
    tx.tenderType.findUnique({ where: { id: t.tenderTypeId } }),
    tx.projectStatus.findFirst({ where: { isActive: true, deletedAt: null }, orderBy: { sequence: "asc" } }),
  ]);
  const siteId =
    t.siteId ?? (await tx.site.findFirst({ where: { organisationId: t.organisationId, regionId: t.regionId, deletedAt: null }, orderBy: { id: "asc" }, select: { id: true } }))?.id;
  const gstRegistrationId = t.gstRegistrationId ?? (await defaultGstRegistrationId(tx, t.regionId));
  if (!siteId) throw new ServiceError("CONFLICT", "No plant site is linked to this tender, so a project cannot be placed.");
  if (!gstRegistrationId) throw new ServiceError("CONFLICT", "No GSTIN is set up for this tender's region, so the project cannot be registered.");
  if (!status) throw new ServiceError("NOT_FOUND", "No project status is configured");

  const today = todayIst();
  const contractValue = (award?.awardedAmount ?? bid?.quotedAmount ?? t.estimatedValue).toFixed(2);
  const isService = (type?.name ?? "").toLowerCase().includes("service");
  const startDate = award?.startDate ? award.startDate.toISOString().slice(0, 10) : addDays(today, 7);
  const plannedEnd = addDays(startDate, award?.completionPeriodDays ?? 365);
  const code = await nextProjectCode(tx, t.regionId);

  let project;
  try {
    project = await tx.project.create({
      data: {
        code, name: t.title, serviceLineId: t.serviceLineId, siteId, contractType: isService ? "SERVICE" : "FIXED_SCOPE",
        workOrderNo: award?.loaNo ?? t.tenderNo, workOrderDate: award?.loaDate ?? dateOnly(today),
        billingCycle: isService ? "MONTHLY" : "MILESTONE", paymentTermsDays: 30, tenderId: t.id,
        organisationId: t.organisationId, regionId: t.regionId, gstRegistrationId, contractValue,
        startDate: dateOnly(startDate), plannedEndDate: dateOnly(plannedEnd), statusId: status.id, createdById: user.id,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ServiceError("CONFLICT", "Already converted to a project.");
    throw e;
  }
  const request = await tx.auditLog.findFirst({ where: { approvalRequestId: p.requestId, action: "tender.conversion.request" } });
  const overrideReason = ((request?.after ?? {}) as { overrideReason?: string | null }).overrideReason ?? null;
  await tx.projectConversion.create({
    data: {
      tenderId: t.id, projectId: project.id, convertedById: user.id, convertedAt: new Date(), overrideReason, approvalRequestId: p.requestId,
      snapshot: {
        tenderNo: t.tenderNo, estimatedValue: t.estimatedValue.toFixed(2), awardedAmount: contractValue, workOrderNo: project.workOrderNo,
        loaDate: award?.loaDate?.toISOString().slice(0, 10) ?? null, agreementDate: award?.agreementDate?.toISOString().slice(0, 10) ?? null,
      },
      createdById: user.id,
    },
  });
  await tx.securityInstrument.updateMany({ where: { tenderId: t.id, type: "PBG", deletedAt: null }, data: { projectId: project.id } });

  await writeAudit(tx, {
    user, action: "tender.convert", entityType: "Tender", entityId: t.id, regionId: t.regionId, projectId: project.id, approvalRequestId: p.requestId,
    after: { projectId: project.id, code, contractValue }, reason: overrideReason ?? "Approved conversion to project",
    summary: `${t.tenderNo} converted to project ${code}`,
  });
  await writeAudit(tx, {
    user, action: "project.create", entityType: "Project", entityId: project.id, regionId: t.regionId, projectId: project.id, approvalRequestId: p.requestId,
    after: { code, name: project.name, tenderId: t.id, contractValue, gstRegistrationId, organisationId: t.organisationId, regionId: t.regionId },
    summary: `Project ${code} created from tender ${t.tenderNo}`,
  });
  return project;
}

// ---------------------------------------------------------------------------
// GO / NO-GO decision applied by the approval handler
// ---------------------------------------------------------------------------

/**
 * Director approved the request. The proposed decision (GO or NO-GO) was recorded in the audit row written at request
 * time; a request without one (seeded demo requests) is a plain GO. GO moves the tender on to the next open stage;
 * NO-GO closes it in the NO_GO stage if one is configured, otherwise the Lost stage.
 */
export async function applyGoNoGoDecision(tx: Tx, user: SessionUser, p: { tenderId: string; requestId: string; directorNote: string | null }) {
  const t = await loadTender(tx, p.tenderId);
  const proposal = await tx.auditLog.findFirst({ where: { approvalRequestId: p.requestId, action: "tender.go_nogo.request" } });
  const after = (proposal?.after ?? {}) as { recommendation?: string; reason?: string | null };
  const decision: "GO" | "NO_GO" = after.recommendation === "NO_GO" ? "NO_GO" : "GO";
  const reason = after.reason || p.directorNote || (decision === "GO" ? "Approved to participate" : null);
  if (decision === "NO_GO" && !reason) throw new ServiceError("VALIDATION", "A NO-GO needs a reason");

  await tx.goNoGoDecision.create({
    data: { tenderId: t.id, decision, decidedById: user.id, decidedAt: new Date(), reason, approvalRequestId: p.requestId, createdById: user.id },
  });

  const stages = await activeStages(tx);
  const from = stages.find((s) => s.id === t.currentStageId);
  let to = undefined as (typeof stages)[number] | undefined;
  let result: string | null = null;
  if (decision === "GO") {
    const open = stages.filter((s) => s.kind === "OPEN");
    const i = open.findIndex((s) => s.id === t.currentStageId);
    if (from?.systemKey === "UNDER_EVALUATION" && i >= 0) to = open[i + 1];
  } else {
    to = stages.find((s) => s.kind === "NO_GO") ?? stages.find((s) => s.kind === "LOST");
    result = (await tx.tenderResult.findFirst({ where: { outcome: "NEUTRAL", isActive: true, deletedAt: null }, orderBy: { id: "asc" } }))?.id ?? null;
  }
  if (to && to.id !== t.currentStageId) {
    await setStage(tx, t.id, to.id, user.id, decision === "NO_GO" ? { resultId: result } : {});
    await addHistory(tx, { tenderId: t.id, fromStageId: t.currentStageId, toStageId: to.id, userId: user.id, reason: reason ?? undefined });
  }
  await writeAudit(tx, {
    user, action: "tender.go_nogo.decided", entityType: "Tender", entityId: t.id, regionId: t.regionId, approvalRequestId: p.requestId,
    before: { stage: from?.name ?? null }, after: { decision, stage: to?.name ?? from?.name ?? null }, reason: reason ?? "Approved",
    summary: `${t.tenderNo}: ${decision === "GO" ? "GO" : "NO-GO"} approved`,
  });
}
