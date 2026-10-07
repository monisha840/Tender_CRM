import { addDays, daysBetween, dayOfWeek, DEMO_TODAY } from "@/lib/dates";
import type { Id, IsoDate, Notification } from "@/types";
import { userId, USER_SPECS } from "./org";
import type { ProjectInfo } from "./projects";
import { at, dayOffset, meta, type SeedCtx } from "./helpers";

export function seedNotifications(ctx: SeedCtx, projects: ProjectInfo[]) {
  const { db } = ctx;
  const out: Notification[] = [];
  const seen = new Set<string>();

  const push = (userKey: string, type: string, title: string, body: string, entityType: string, entityId: Id, ageDays: number) => {
    const dedupeKey = `${type}:${entityId}:${userKey}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const date = dayOffset(-ageDays);
    out.push({
      ...meta(`ntf_${out.length + 1}`, at(date, "09:30")),
      userId: userId(userKey), type, title, body, entityType, entityId, dedupeKey, readAt: ageDays >= 3 ? at(addDays(date, 1), "10:00") : null,
    });
  };
  const userKeyOf = (uid: Id) => USER_SPECS.find((u) => userId(u.key) === uid)?.key ?? "director";

  // Pending approvals → the assignee
  db.approvalSteps
    .filter((s) => s.status === "PENDING" && s.assignedUserId)
    .forEach((s) => {
      const req = db.approvalRequests.find((r) => r.id === s.requestId)!;
      push(userKeyOf(s.assignedUserId!), "APPROVAL_PENDING", "Approval pending", req.title, "APPROVAL_REQUEST", req.id, daysBetween(req.submittedAt.slice(0, 10), DEMO_TODAY));
    });

  // Tender deadlines (default reminders 7 / 3 / 1 days) and missing mandatory documents
  db.tenders.forEach((t) => {
    const stage = db.tenderStages.find((s) => s.id === t.currentStageId)!;
    const owner = userKeyOf(t.ownerId);
    const days = daysBetween(DEMO_TODAY, t.submissionDeadlineAt.slice(0, 10));
    const preSubmission = ["stg_preparation", "stg_emd_arranged", "stg_go_no_go_pending", "stg_registered"].includes(stage.id);
    if (preSubmission && days >= 0 && days <= 7) {
      push(owner, "TENDER_DEADLINE", `Tender deadline in ${days} day${days === 1 ? "" : "s"}`, t.title, "TENDER", t.id, 0);
    }
    const missing = db.tenderDocumentItems.filter((d) => d.tenderId === t.id && d.isMandatory && d.status !== "READY" && d.status !== "NA");
    if (preSubmission && missing.length && days <= 10) {
      push(owner, "DOC_MISSING", `${missing.length} mandatory document${missing.length === 1 ? "" : "s"} not ready`, t.title, "TENDER", t.id, 1);
      push("legal", "DOC_MISSING", `${missing.length} mandatory document${missing.length === 1 ? "" : "s"} not ready`, t.title, "TENDER", t.id, 1);
    }
  });

  // EMD refund follow-ups (requested > 30 days ago, not refunded)
  db.securityInstrumentEvents
    .filter((e) => e.type === "REFUND_REQUESTED")
    .forEach((e) => {
      const instrument = db.securityInstruments.find((s) => s.id === e.securityInstrumentId)!;
      if (instrument.status !== "SUBMITTED") return;
      const age = daysBetween(e.date, DEMO_TODAY);
      if (age > 30) push("accounts", "EMD_REFUND_FOLLOWUP", `EMD refund pending for ${age} days`, db.tenders.find((t) => t.id === instrument.tenderId)!.title, "TENDER", instrument.tenderId, 2);
    });

  // PBG expiry within 45 days; overdue award conditions
  db.securityInstruments
    .filter((s) => s.type === "PBG" && s.status === "SUBMITTED" && s.expiryDate)
    .forEach((s) => {
      const days = daysBetween(DEMO_TODAY, s.expiryDate!);
      if (days >= 0 && days <= 45) {
        const title = db.tenders.find((t) => t.id === s.tenderId)!.title;
        push("accounts", "PBG_EXPIRY", `PBG expires in ${days} days`, title, "TENDER", s.tenderId, 1);
        push("legal", "PBG_EXPIRY", `PBG expires in ${days} days`, title, "TENDER", s.tenderId, 1);
      }
    });
  db.awardConditions
    .filter((c) => c.status === "PENDING" && c.isMandatory && c.dueDate && c.dueDate < DEMO_TODAY)
    .forEach((c) => {
      const award = db.tenderAwards.find((a) => a.id === c.awardId)!;
      push("legal", "AWARD_CONDITION_OVERDUE", `${c.description}: ${daysBetween(c.dueDate!, DEMO_TODAY)} days overdue`, db.tenders.find((t) => t.id === award.tenderId)!.title, "TENDER", award.tenderId, 2);
      push("accounts", "AWARD_CONDITION_OVERDUE", `${c.description}: ${daysBetween(c.dueDate!, DEMO_TODAY)} days overdue`, db.tenders.find((t) => t.id === award.tenderId)!.title, "TENDER", award.tenderId, 2);
    });

  // Missing daily reports (last two working days) → the project manager
  [DEMO_TODAY, addDays(DEMO_TODAY, -1)].forEach((date: IsoDate) => {
    if (dayOfWeek(date) === 0) return;
    db.sites.forEach((site) => {
      if (db.dailyReports.some((r) => r.siteId === site.id && r.reportDate === date)) return;
      const proj = projects.find((p) => p.id === site.projectId)!;
      push(proj.pmKey, "REPORT_MISSING", "Daily site report not submitted", `${site.name}, ${date}`, "SITE", site.id, daysBetween(date, DEMO_TODAY));
    });
  });

  // Overdue department payments → accounts, director
  db.raBills
    .filter((b) => b.dueDate < DEMO_TODAY && Number(b.receivedAmount) < Number(b.netPayable))
    .forEach((b) => {
      const proj = projects.find((p) => p.id === b.projectId)!;
      push("accounts", "PAYMENT_OVERDUE", `RA bill ${b.billNo} overdue by ${daysBetween(b.dueDate, DEMO_TODAY)} days`, `${proj.key}`, "RA_BILL", b.id, 1);
    });

  // Delayed projects (more than 15 points behind plan)
  projects
    .filter((p) => p.expectedPct - p.actualPct > 15)
    .forEach((p) => {
      const rh = p.regionKey === "korba" ? "rh_korba" : p.regionKey === "delhi" ? "rh_delhi" : "rh_mh";
      const project = db.projects.find((x) => x.id === p.id)!;
      [p.pmKey, rh, "director"].forEach((u) => push(u, "PROJECT_DELAYED", "Project is behind schedule", project.name, "PROJECT", p.id, 2));
    });

  db.notifications.push(...out);
}

export function seedAudit(ctx: SeedCtx) {
  const { db } = ctx;
  const stageName = (id: Id) => db.tenderStages.find((s) => s.id === id)!.name;
  let n = 0;
  const add = (a: Omit<(typeof db.auditLogs)[number], "id" | "createdAt" | "updatedAt" | "deletedAt">) =>
    db.auditLogs.push({ ...meta(`aud_${++n}`, a.occurredAt), ...a });

  db.tenderStageHistory.forEach((h) => {
    const t = db.tenders.find((x) => x.id === h.tenderId)!;
    add({
      occurredAt: h.changedAt, actorId: h.changedById, actorType: "USER", action: "STAGE_CHANGE", entityType: "TENDER", entityId: t.id,
      regionId: t.regionId, projectId: null, summary: `${t.tenderNo}: moved to ${stageName(h.toStageId)}`,
      before: h.fromStageId ? { stage: stageName(h.fromStageId) } : null, after: { stage: stageName(h.toStageId) }, reason: h.reason ?? null,
    });
  });
  db.goNoGoDecisions.forEach((g) => {
    const t = db.tenders.find((x) => x.id === g.tenderId)!;
    add({
      occurredAt: g.decidedAt, actorId: g.decidedById, actorType: "USER", action: g.decision === "GO" ? "GO_DECISION" : "NO_GO_DECISION",
      entityType: "TENDER", entityId: t.id, regionId: t.regionId, projectId: null, summary: `${t.tenderNo}: ${g.decision === "GO" ? "GO" : "NO-GO"} decision recorded`,
      before: null, after: { decision: g.decision }, reason: g.reason ?? null,
    });
  });
  db.projectConversions.forEach((c) => {
    const p = db.projects.find((x) => x.id === c.projectId)!;
    add({
      occurredAt: c.convertedAt, actorId: c.convertedById, actorType: "USER", action: "CONVERT_TO_PROJECT", entityType: "PROJECT", entityId: p.id,
      regionId: p.regionId, projectId: p.id, summary: `${p.code}: created from tender`, before: null, after: { contractValue: p.contractValue }, reason: null,
    });
  });

  // Amount corrections always carry a reason (CLAUDE.md → Audit everything important)
  const sensitive: [string, string, string, string, string, string, number][] = [
    ["tender2", "BID", "bid_del_sewer", "Bid amount revised", "Revised after BOQ rate correction, before submission.", "reg_delhi", -73],
    ["accounts", "SECURITY_INSTRUMENT", "si_emd_korba_bridge", "EMD instrument number corrected", "DD number mistyped at entry; corrected from bank slip.", "reg_korba", -22],
    ["accounts", "PAYROLL_RUN", "prun_2026-08_mh", "Payroll run re-opened and re-locked", "Missed overtime for two Pune site workers.", "reg_mh", -35],
  ];
  sensitive.forEach(([actor, entityType, entityId, summary, reason, regionId, offset]) =>
    add({
      occurredAt: at(dayOffset(offset), "15:10"), actorId: userId(actor), actorType: "USER", action: "UPDATE", entityType, entityId, regionId, projectId: null,
      summary, before: { note: "previous value" }, after: { note: "corrected value" }, reason,
    }),
  );
  db.auditLogs.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}
