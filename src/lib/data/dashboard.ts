import { addDays, daysBetween, getToday, relativeDeadline } from "@/lib/dates";
import { formatINR, moneyToNumber } from "@/lib/money";
import type { Database, Id } from "@/types";
import { canView } from "./access";
import { getGstFilingSummary, getPayablesSummary, getReceivablesSummary, listReceivables } from "./accounts";
import { getPendingApprovalsFor } from "./approvals";
import { entityHref } from "./links";
import { listProjects } from "./projects";
import { inRegion, type RegionFilter } from "./shared";
import { getAttendanceSummary } from "./workforce";
import { getManpowerTrend, getMissingReports, listSiteIssues } from "./sites";
import { getSecuritiesSummary, getTenderStats, getUpcomingDeadlines, listTenders } from "./tenders";

export type AttentionSeverity = "danger" | "warning" | "info";

/** One row in the dashboard's "Attention" area: what needs doing, and where to do it. */
export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  /** Module key (matches nav) used to hide items the persona cannot open. */
  module: string;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  /** Optional urgency label, e.g. "in 2 days" or "5 days overdue". */
  dueLabel?: string;
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = { danger: 0, warning: 1, info: 2 };

export function getAttentionItems(db: Database, userId: Id, region: RegionFilter = "ALL"): AttentionItem[] {
  const today = getToday();
  const items: AttentionItem[] = [];

  getPendingApprovalsFor(db, userId)
    .filter((a) => inRegion(region, a.request.regionId))
    .forEach((a) =>
      items.push({
        id: `approval:${a.request.id}`,
        severity: "warning",
        module: "approvals",
        title: a.request.title,
        detail: `${a.typeLabel} awaiting your decision · requested by ${a.requestedBy}`,
        href: "/approvals",
        actionLabel: "Review",
        dueLabel: a.dueAt ? relativeDeadline(a.dueAt).label : undefined,
      }),
    );

  getUpcomingDeadlines(db, region, 7).forEach((r) => {
    const d = relativeDeadline(r.tender.submissionDeadlineAt);
    items.push({
      id: `deadline:${r.tender.id}`,
      severity: d.days <= 3 ? "danger" : "warning",
      module: "tenders",
      title: r.tender.title,
      detail: `Bid deadline · ${r.stage.name} · ${r.organisationName}`,
      href: entityHref("TENDER", r.tender.id),
      actionLabel: "Open tender",
      dueLabel: d.label,
    });
    const missing = db.tenderDocumentItems.filter((x) => x.tenderId === r.tender.id && x.isMandatory && x.status !== "READY" && x.status !== "NA");
    if (missing.length) {
      items.push({
        id: `docs:${r.tender.id}`,
        severity: "danger",
        module: "tenders",
        title: `${missing.length} mandatory document${missing.length === 1 ? "" : "s"} not ready`,
        detail: `${r.tender.title} · ${missing.slice(0, 2).map((m) => m.name).join(", ")}${missing.length > 2 ? "…" : ""}`,
        href: entityHref("TENDER", r.tender.id),
        actionLabel: "Complete documents",
        dueLabel: d.label,
      });
    }
  });

  // Won tenders with a signed agreement and all mandatory conditions met, still without a project.
  listTenders(db, { region }).forEach((r) => {
    if (r.stage.systemKey !== "WON" || db.projects.some((p) => p.tenderId === r.tender.id)) return;
    const award = db.tenderAwards.find((a) => a.tenderId === r.tender.id);
    if (!award?.agreementNo) return;
    const open = db.awardConditions.filter((c) => c.awardId === award.id && c.isMandatory && c.status === "PENDING");
    if (!open.length) {
      items.push({ id: `convert:${r.tender.id}`, severity: "info", module: "tenders", title: r.tender.title, detail: "Agreement signed and conditions met, ready to convert to a project", href: entityHref("TENDER", r.tender.id), actionLabel: "Convert to project" });
    }
  });

  // Overdue award conditions (PBG, agreement)
  db.awardConditions
    .filter((c) => c.status === "PENDING" && c.isMandatory && c.dueDate && c.dueDate < today)
    .forEach((c) => {
      const award = db.tenderAwards.find((a) => a.id === c.awardId)!;
      const tender = db.tenders.find((t) => t.id === award.tenderId)!;
      if (!inRegion(region, tender.regionId)) return;
      items.push({ id: `cond:${c.id}`, severity: "danger", module: "tenders", title: c.description, detail: tender.title, href: entityHref("TENDER", tender.id), actionLabel: "Follow up", dueLabel: relativeDeadline(c.dueDate!).label });
    });

  // EMD refund follow-ups and PBG expiry
  db.securityInstrumentEvents
    .filter((e) => e.type === "REFUND_REQUESTED")
    .forEach((e) => {
      const si = db.securityInstruments.find((s) => s.id === e.securityInstrumentId)!;
      const tender = db.tenders.find((t) => t.id === si.tenderId)!;
      const age = daysBetween(e.date, today);
      if (si.status === "SUBMITTED" && age > 30 && inRegion(region, tender.regionId)) {
        items.push({ id: `emd:${si.id}`, severity: "warning", module: "tenders", title: `EMD refund pending ${age} days`, detail: `${formatINR(si.amount, { compact: "auto" })} · ${tender.title}`, href: entityHref("TENDER", tender.id), actionLabel: "Follow up" });
      }
    });
  db.securityInstruments
    .filter((s) => s.type === "PBG" && s.status === "SUBMITTED" && s.expiryDate && daysBetween(today, s.expiryDate) >= 0 && daysBetween(today, s.expiryDate) <= 45)
    .forEach((s) => {
      const tender = db.tenders.find((t) => t.id === s.tenderId)!;
      if (!inRegion(region, tender.regionId)) return;
      items.push({ id: `pbg:${s.id}`, severity: "warning", module: "tenders", title: "PBG nearing expiry", detail: `${formatINR(s.amount, { compact: "auto" })} · ${tender.title}`, href: entityHref("TENDER", tender.id), actionLabel: "Extend guarantee", dueLabel: relativeDeadline(s.expiryDate!).label });
    });

  // Site reporting
  [today, addDays(today, -1)].forEach((date) =>
    getMissingReports(db, date, region).forEach(({ project, site }) =>
      items.push({ id: `report:${project.id}:${date}`, severity: date === today ? "warning" : "danger", module: "daily_work", title: "Daily work report not submitted", detail: `${site.name}: ${project.name} · ${date === today ? "today" : "yesterday"}`, href: entityHref("SITE", site.id), actionLabel: "Open site", dueLabel: date === today ? undefined : "1 day overdue" }),
    ),
  );
  const attendance = getAttendanceSummary(db, today, region);
  if (attendance.notMarked > 0) {
    items.push({ id: "attendance:today", severity: "warning", module: "employees", title: `Attendance not marked for ${attendance.notMarked} people today`, detail: "Supervisors have not submitted today's attendance for some sites", href: "/employees", actionLabel: "Mark attendance" });
  }
  listSiteIssues(db, region, true)
    .filter((i) => i.severity === "HIGH")
    .forEach((i) => items.push({ id: `issue:${i.id}`, severity: "warning", module: "daily_work", title: i.title, detail: `High severity site issue · raised ${relativeDeadline(i.raisedOn).label.replace("overdue", "ago")}`, href: entityHref("SITE", i.siteId), actionLabel: "View issue" }));

  // Delayed projects and overdue collections
  listProjects(db, region, "RED").forEach((p) =>
    items.push({ id: `project:${p.project.id}`, severity: "danger", module: "projects", title: `${p.project.name} is behind schedule`, detail: `${Math.round(p.progressPct)}% complete against ${Math.round(p.plannedPct)}% planned`, href: entityHref("PROJECT", p.project.id), actionLabel: "Review project" }),
  );
  listReceivables(db, region)
    .filter((r) => r.daysOverdue > 0)
    .forEach((r) => items.push({ id: `inv:${r.invoice.id}`, severity: "danger", module: "finance", title: `Invoice ${r.invoice.invoiceNo} unpaid`, detail: `${formatINR(r.outstanding, { compact: "auto" })} from ${r.organisationName} · ${r.projectName}`, href: entityHref("INVOICE", r.invoice.id), actionLabel: "Follow up", dueLabel: `${r.daysOverdue} days overdue` }));

  // GST filing: due within a week or already missed
  getGstFilingSummary(db, region).rows
    .filter((r) => daysBetween(today, r.invoice.gstFilingDueDate) <= 7)
    .forEach((r) => items.push({ id: `gst:${r.invoice.id}`, severity: r.filingDaysOverdue > 0 ? "danger" : "warning", module: "finance", title: `GST filing pending for ${r.invoice.invoiceNo}`, detail: `${r.organisationName} · ${formatINR(r.invoice.total, { compact: "auto" })}`, href: entityHref("INVOICE", r.invoice.id), actionLabel: "File GST", dueLabel: relativeDeadline(r.invoice.gstFilingDueDate).label }));

  return items
    .filter((i) => canView(db, userId, i.module))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export interface DashboardKpis {
  activeTenders: number;
  pipelineValue: number;
  winRate: number | null;
  activeProjects: number;
  contractValue: number;
  delayedProjects: number;
  receivables: number;
  receivablesOverdue: number;
  payables: number;
  emdLocked: number;
  pbgOutstanding: number;
  workersToday: number;
  /** Last 14 days of reported manpower, for a KPI sparkline. */
  manpowerTrend: number[];
}

export function getDashboardKpis(db: Database, region: RegionFilter = "ALL"): DashboardKpis {
  const tenders = getTenderStats(db, region);
  const projects = listProjects(db, region);
  const securities = getSecuritiesSummary(db, region);
  const trend = getManpowerTrend(db, region, 14);
  return {
    activeTenders: tenders.activeCount,
    pipelineValue: tenders.activeValue,
    winRate: tenders.winRate,
    activeProjects: projects.length,
    contractValue: projects.reduce((a, p) => a + moneyToNumber(p.project.contractValue), 0),
    delayedProjects: projects.filter((p) => p.health === "RED").length,
    receivables: moneyToNumber(getReceivablesSummary(db, region).total),
    receivablesOverdue: moneyToNumber(getReceivablesSummary(db, region).overdue),
    payables: moneyToNumber(getPayablesSummary(db, region).total),
    emdLocked: moneyToNumber(securities.emdLocked),
    pbgOutstanding: moneyToNumber(securities.pbgOutstanding),
    workersToday: trend[trend.length - 1]?.workers ?? 0,
    manpowerTrend: trend.map((t) => t.workers),
  };
}
