import { buildSeedDatabase } from "@/lib/data/seed";
import {
  getDashboard,
  getGstFilingSummary,
  getProjectBilling,
  listEmployeePay,
  listProjects,
  listSubcontractorAssignments,
  listTenders,
} from "@/lib/data";
import { DEMO_TODAY, lastNMonths } from "@/lib/dates";
import { formatINR, sumMoney, toPaise } from "@/lib/money";

/**
 * Audits the mock seed against the client's field lists and requirements.
 * Run with `npm run seed:check`; exits non-zero when a check fails.
 */
const db = buildSeedDatabase();
let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures++;
};
const distinct = <T>(values: T[]) => new Set(values).size;

console.log(JSON.stringify(Object.fromEntries(Object.entries(db).map(([k, v]) => [k, (v as unknown[]).length]))));
console.log("in-memory size KB (never persisted; only user edits are stored)", Math.round(JSON.stringify(db).length / 1024));

// ---- Integrity and determinism ----
let dups = 0;
for (const [k, rows] of Object.entries(db)) {
  const ids = new Set<string>();
  for (const r of rows as { id: string }[]) {
    if (ids.has(r.id)) {
      console.log("DUP", k, r.id);
      dups++;
    }
    ids.add(r.id);
  }
}
check(dups === 0, "no duplicate ids");
check(JSON.stringify(db) === JSON.stringify(buildSeedDatabase()), "seed is deterministic");

// ---- Organisation, sites, service lines ----
check(db.tenderStages.map((s) => s.name).join(",") === "New,Under Evaluation,Bid Preparing,Submitted,Won,Lost", "tender stages: New, Under Evaluation, Bid Preparing, Submitted, Won, Lost");
check(db.serviceLines.length === 6, "six service lines");
check(["NTPC", "CSPGCL", "MSPGCL", "DVC", "MPPGCL", "KPCL", "TANGEDCO", "IOCL", "NALCO"].every((s) => db.organisations.some((o) => o.shortName === s)), "all nine organisations");
check(["Dr. A. Joseph Stalin", "Antony Bala Prince", "Augusti Marys Priyadarshini"].every((n) => db.users.some((u) => u.name === n)), "directors present");
check(db.offices.some((o) => o.kind === "REGISTERED" && o.name.includes("Mumbai")) && db.offices.some((o) => o.kind === "BRANCH" && o.name.includes("Chennai")), "registered office Mumbai, branch Chennai");
check(["NTPC Korba", "CSPGCL Korba West", "MSPGCL Chandrapur", "MSPGCL Koradi"].every((n) => db.sites.some((s) => s.name === n)), "named plant sites");

// ---- Tenders (~40): ID, organisation, name, description, value, EMD, fee, dates, eligibility, documents, status ----
console.log("tenders", db.tenders.length);
check(db.tenders.length >= 38 && db.tenders.length <= 45, "about 40 tenders");
check(db.tenders.every((t) => t.tenderNo && t.organisationId && t.title && t.workDescription && t.eligibility && t.openingDate && t.submissionDeadlineAt), "tender fields: id, organisation, name, description, eligibility, dates");
check(db.tenders.every((t) => Number(t.estimatedValue) > 0 && Number(t.emdAmount) > 0 && Number(t.tenderFee) > 0), "tender value, EMD and fee are all set");
const tenderValues = db.tenders.map((t) => Number(toPaise(t.estimatedValue)) / 100);
check(Math.min(...tenderValues) >= 3_000_000 && Math.max(...tenderValues) <= 150_000_000, "tender values between Rs 30 L and Rs 15 Cr");
const rows = listTenders(db);
const soon = rows.filter((r) => r.stage.kind === "OPEN" && !["Submitted"].includes(r.stage.name) && r.daysToDeadline >= 0 && r.daysToDeadline <= 7);
console.log("deadlines in the next 7 days", soon.map((r) => `${r.daysToDeadline}d ${r.stage.name}`).join(", "));
check(soon.length >= 5, "several tender deadlines in the next 7 days");
const preparing = db.tenders.filter((t) => ["stg_bid_preparing", "stg_submitted", "stg_won", "stg_lost"].includes(t.currentStageId));
check(preparing.every((t) => db.tenderDocumentItems.filter((d) => d.tenderId === t.id).length >= 10), "document checklist on every tender past evaluation");
check(distinct(db.tenderDocumentItems.map((d) => d.status)) >= 3, "document statuses vary");
const byStage: Record<string, number> = {};
db.tenders.forEach((x) => {
  const n = db.tenderStages.find((s) => s.id === x.currentStageId)!.name;
  byStage[n] = (byStage[n] ?? 0) + 1;
});
console.log(byStage);

// ---- Projects (8-10) ----
const projects = listProjects(db);
console.log("projects", projects.length);
check(projects.length >= 8 && projects.length <= 10, "8 to 10 projects");
check(projects.some((r) => r.project.contractType === "SERVICE") && projects.some((r) => r.project.contractType === "FIXED_SCOPE"), "mix of service contracts and fixed-scope jobs");
check(projects.every((r) => r.project.workOrderNo && r.project.siteId && r.project.projectManagerId && r.project.startDate && r.project.plannedEndDate), "project fields: work order no., site, manager, dates");
check(projects.some((r) => r.status.systemKey === "COMPLETED") && projects.some((r) => r.status.systemKey === "IN_PROGRESS"), "work status varies (in progress, completed)");
check(distinct(db.progressSnapshots.map((s) => s.month)) >= 10, "monthly progress history spans 10+ months");
check(db.projects.every((p) => db.progressSnapshots.filter((s) => s.projectId === p.id).length >= 3), "every project has progress history");
for (const row of projects) {
  const p = row.project;
  const boqTotal = sumMoney(db.boqItems.filter((b) => b.projectId === p.id).map((b) => b.amount));
  const billing = getProjectBilling(db, p.id);
  console.log(p.code, p.contractType, p.billingCycle, row.status.name, formatINR(p.contractValue, { compact: true }), row.health, `${row.progressPct.toFixed(0)}%/${row.plannedPct.toFixed(0)}%`, "billed", formatINR(billing.invoicedTaxable, { compact: true }), "received", formatINR(billing.received, { compact: true }));
  check(boqTotal === p.contractValue, `${p.code}: BOQ sums to contract value`);
}
console.log("BOQ units", [...new Set(db.boqItems.map((b) => b.unit))].join(", "));

// ---- Subcontractors (~10) ----
console.log("subcontractors", db.subcontractors.length, "assignments", db.workOrders.length);
check(db.subcontractors.length >= 9 && db.subcontractors.length <= 13, "about 10 subcontractors");
const assignments = listSubcontractorAssignments(db);
const projectsPerSub = new Map<string, Set<string>>();
db.workOrders.forEach((w) => projectsPerSub.set(w.subcontractorId, (projectsPerSub.get(w.subcontractorId) ?? new Set()).add(w.projectId)));
check([...projectsPerSub.values()].some((s) => s.size >= 2), "one subcontractor works on several projects");
const p10 = listSubcontractorAssignments(db, { projectId: "prj_p10_kpcl_pkg" });
check(db.projects.find((p) => p.id === "prj_p10_kpcl_pkg")!.contractValue === "5000000.00", "Raichur package is exactly Rs 50,00,000");
check(p10.length === 3 && ["Civil", "Stone Picking", "Painting"].every((t) => p10.some((o) => o.trade === t)), "Rs 50 L project has Civil, Stone Picking and Painting subcontractors");
check(assignments.every((a) => a.trade && a.endDate && a.billCount > 0), "assignments carry trade, dates and bills");
check(db.subcontractorBills.every((b) => b.billDate && Number(b.grossAmount) > 0 && b.status), "bills carry submitted date, amount and status");
check(assignments.some((a) => a.lastPaymentDate) && assignments.some((a) => Number(a.balance) > 0), "paid amount, balance and payment date present");
check(db.subcontractors.every((s) => db.documentLinks.some((l) => l.entityType === "SUBCONTRACTOR" && l.entityId === s.id)), "every subcontractor has documents");
check(db.parties.filter((p) => db.subcontractors.some((s) => s.partyId === p.id)).every((p) => p.contactName && p.phone), "subcontractor contact details");

// ---- Employees (~150) ----
console.log("employees", db.employees.length);
check(db.employees.length >= 140 && db.employees.length <= 170, "about 150 employees");
check(db.employeeProfiles.every((p) => p.designation && p.department && p.joiningDate), "designation, department and joining date on every employee");
check(distinct(db.employeeProfiles.map((p) => p.department)) >= 6, "several departments");
const attDates = distinct(db.attendance.map((a) => a.date));
check(attDates >= 88, `three months of attendance (${attDates} days)`);
const periods = [...new Set(db.payrollRuns.map((r) => r.periodMonth))].sort();
check(periods.length === 6, `six months of payroll (${periods.join(", ")})`);
const latest = periods[periods.length - 1];
const pay = listEmployeePay(db, latest).filter((r) => r.payslip);
check(pay.every((r) => toPaise(r.payslip!.net) === toPaise(r.payslip!.gross) - toPaise(r.payslip!.totalDeductions)), "net salary = gross - total deductions");
check(pay.some((r) => Number(r.payslip!.esiEmployee) > 0) && pay.some((r) => Number(r.payslip!.esiEmployee) === 0 && !r.profile.esiApplicable), "ESI only where applicable");
check(pay.every((r) => !r.profile.pfApplicable || Number(r.payslip!.epfEmployee) > 0), "PF on every PF-applicable employee");
check(pay.some((r) => Number(r.payslip!.advanceRecovered) > 0), "advance recoveries present");
check(["PAID", "PENDING", "ON_HOLD"].every((st) => db.payslips.some((p) => p.paymentStatus === st)), "payment status: paid, pending and on hold all present");

// ---- GST and finance ----
const months = [...new Set(db.invoices.map((i) => i.invoiceDate.slice(0, 7)))].sort();
console.log("invoice months", months.length, months[0], "→", months[months.length - 1]);
const wanted = lastNMonths(12);
check(wanted.every((m) => db.invoices.some((i) => i.invoiceDate.startsWith(m))), "invoices in each of the last 12 months");
check(db.invoices.every((i) => i.invoiceNo && i.invoiceDate && i.customerGstin && i.gstRegistrationId && i.dueDate && i.gstFilingDueDate), "invoice fields: GSTIN, number, date, customer, due dates");
check(distinct(db.invoices.map((i) => i.gstRegistrationId)) === 4, "invoices issued under each state's GSTIN");
const gstState = new Map(db.gstRegistrations.map((g) => [g.id, g.stateId]));
const siteState = new Map(db.sites.map((s) => [s.id, s.stateId]));
const projectSite = new Map(db.projects.map((p) => [p.id, p.siteId]));
const taxOk = db.invoices.every((i) => {
  const intra = gstState.get(i.gstRegistrationId) === siteState.get(projectSite.get(i.projectId)!);
  return intra ? Number(i.igst) === 0 && Number(i.cgst) > 0 && i.cgst === i.sgst || (Number(i.igst) === 0 && Number(i.cgst) > 0) : Number(i.cgst) === 0 && Number(i.sgst) === 0 && Number(i.igst) > 0;
});
check(taxOk, "CGST+SGST for intra-state, IGST for inter-state supplies");
check(db.invoices.every((i) => toPaise(i.total) === toPaise(i.taxableValue) + toPaise(i.cgst) + toPaise(i.sgst) + toPaise(i.igst)), "invoice total = taxable + taxes");
check(db.invoices.every((i) => toPaise(i.netReceivable) === toPaise(i.total) - toPaise(i.totalDeductions)), "invoice net = total - deductions");
check(db.invoices.filter((i) => i.gstFilingStatus === "FILED").every((i) => i.filingReference), "filed invoices have a filing reference");
check(["UNPAID", "PARTLY_PAID", "PAID"].every((st) => db.invoices.some((i) => i.paymentStatus === st)), "payment status varies");
const gst = getGstFilingSummary(db);
check(gst.pending > 0 && gst.overdue > 0, `GST filing: ${gst.filed} filed, ${gst.pending} pending, ${gst.overdue} overdue`);

// ---- Daily work, approvals, notifications ----
const active = db.projects.filter((p) => db.projectStatuses.find((s) => s.id === p.statusId)!.systemKey !== "COMPLETED");
const reportDays = active.map((p) => distinct(db.dailyReports.filter((r) => r.projectId === p.id).map((r) => r.reportDate)));
console.log("report days per active project", reportDays.join(", "));
check(Math.min(...reportDays) >= 20 && Math.max(...reportDays) >= 25, "about 30 days of daily reports per active site (Sundays and a few deliberate gaps excluded)");
check(db.dailyReports.some((r) => r.reportDate === DEMO_TODAY), "reports exist for today");
const pending = db.approvalRequests.filter((r) => r.status === "PENDING");
console.log("pending approvals", pending.length, [...new Set(pending.map((p) => p.entityType))].join(", "));
check(pending.length >= 10 && pending.length <= 16 && distinct(pending.map((p) => p.entityType)) >= 4, "about 12 pending approvals across several types");
check(db.notifications.length >= 40 && distinct(db.notifications.map((n) => n.type)) >= 8, "varied, realistic notifications");

// ---- The client's 13 dashboard items ----
const d = getDashboard(db);
console.log("\nDashboard (all regions)");
console.log(" 1 Active tenders           ", d.activeTenders.count, formatINR(d.activeTenders.totalValue, { compact: true }));
console.log(" 2 Deadlines in 7 days      ", d.upcomingDeadlines.count, "urgent", d.upcomingDeadlines.urgent, "missing docs", d.upcomingDeadlines.withMissingDocuments);
console.log(" 3 Won / Lost               ", d.wonLost.won, "/", d.wonLost.lost, `${d.wonLost.winRate}%`, formatINR(d.wonLost.wonValue, { compact: true }), formatINR(d.wonLost.lostValue, { compact: true }));
console.log(" 4 Active projects          ", d.activeProjects.count, d.activeProjects.byHealth, `${d.activeProjects.avgProgressPct.toFixed(0)}% avg`);
console.log(" 5 Project value            ", formatINR(d.projectValue.activeContractValue, { compact: true }), "billed", formatINR(d.projectValue.billedToDate, { compact: true }), "received", formatINR(d.projectValue.received, { compact: true }));
console.log(" 6 Subcontractor work       ", d.subcontractorWork.assignments, "assignments", formatINR(d.subcontractorWork.contractValue, { compact: true }));
console.log(" 7 Sub pending payments     ", formatINR(d.subcontractorPending.balance, { compact: true }), "waiting approval", d.subcontractorPending.billsAwaitingApproval);
console.log(" 8 Employees                ", d.employees.total, "on payroll", d.employees.onPayroll);
console.log(" 9 Salary pending           ", d.salaryPending.period, formatINR(d.salaryPending.pendingAmount, { compact: true }), "on hold", formatINR(d.salaryPending.onHoldAmount, { compact: true }));
console.log("10 PF status                ", d.pf.period, formatINR(d.pf.total, { compact: true }), d.pf.status, "due", d.pf.dueDate);
console.log("11 GST                      ", d.gst.filed, "filed", d.gst.pending, "pending", d.gst.overdue, "overdue", "next due", d.gst.nextDueDate);
console.log("12 Receivables              ", formatINR(d.receivables.total, { compact: true }), "overdue", formatINR(d.receivables.overdue, { compact: true }));
console.log("13 Revenue / expenses       ", formatINR(d.revenueExpenses.totalRevenue, { compact: true }), "/", formatINR(d.revenueExpenses.totalExpenses, { compact: true }), `margin ${d.revenueExpenses.marginPct.toFixed(0)}%`);
check(d.activeTenders.count > 0 && d.upcomingDeadlines.count >= 5 && d.wonLost.winRate !== null && d.activeProjects.count >= 8 - 2, "dashboard items 1 to 4 populated");
check(Number(d.projectValue.activeContractValue) > 0 && d.subcontractorWork.assignments > 0 && Number(d.subcontractorPending.balance) > 0, "dashboard items 5 to 7 populated");
check(d.employees.total > 0 && Number(d.salaryPending.pendingAmount) > 0 && d.pf.status !== null && d.gst.pending > 0 && Number(d.receivables.total) > 0, "dashboard items 8 to 12 populated");
check(d.revenueExpenses.months.length === 12 && d.revenueExpenses.months.every((m) => m.revenue > 0 && m.expenses > 0), "revenue and expenses present in each of 12 months");

// ---- Reference integrity (spot) ----
const ids = (arr: { id: string }[]) => new Set(arr.map((x) => x.id));
const refs = (name: string, values: (string | null | undefined)[], valid: Set<string>) => check(values.every((r) => !r || valid.has(r)), `refs: ${name}`);
refs("project.organisation", db.projects.map((p) => p.organisationId), ids(db.organisations));
refs("project.site", db.projects.map((p) => p.siteId), ids(db.sites));
refs("project.manager", db.projects.map((p) => p.projectManagerId), ids(db.employees));
refs("tender.serviceLine", db.tenders.map((t) => t.serviceLineId), ids(db.serviceLines));
refs("attendance.employee", db.attendance.map((a) => a.employeeId), ids(db.employees));
refs("attendance.site", db.attendance.map((a) => a.siteId), ids(db.sites));
refs("invoice.project", db.invoices.map((i) => i.projectId), ids(db.projects));
refs("payment.invoice", db.payments.map((p) => p.invoiceId), ids(db.invoices));
refs("workOrder.subcontractor", db.workOrders.map((w) => w.subcontractorId), ids(db.subcontractors));
refs("approval.assignee", db.approvalSteps.map((s) => s.assignedUserId), ids(db.users));
refs("notification.user", db.notifications.map((n) => n.userId), ids(db.users));
refs("documentLink.document", db.documentLinks.map((l) => l.documentId), ids(db.documents));

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
