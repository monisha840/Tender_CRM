import { buildSeedDatabase } from "@/lib/data/seed";
import { listSubcontractorAssignments, listEmployeePay, getGstFilingSummary, getReceivablesSummary, getProjectBilling, listProjects } from "@/lib/data";
import { formatINR, sumMoney, toPaise } from "@/lib/money";

const db = buildSeedDatabase();
let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures++;
};

const counts = Object.fromEntries(Object.entries(db).map(([k, v]) => [k, (v as unknown[]).length]));
console.log(JSON.stringify(counts));
const sizeKb = Math.round(JSON.stringify(db).length / 1024);
console.log("json size KB", sizeKb);
check(sizeKb < 3500, "serialised database fits comfortably in localStorage (< 3.5 MB)");

// Unique ids and determinism
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

// Client scope
check(db.tenderStages.map((s) => s.name).join(",") === "New,Under Evaluation,Bid Preparing,Submitted,Won,Lost", "tender stages are New, Under Evaluation, Bid Preparing, Submitted, Won, Lost");
check(db.serviceLines.length === 6, "six service lines");
check(["NTPC", "CSPGCL", "MSPGCL", "DVC", "MPPGCL", "KPCL", "TANGEDCO", "IOCL", "NALCO"].every((s) => db.organisations.some((o) => o.shortName === s)), "all nine organisations");
check(["Dr. A. Joseph Stalin", "Antony Bala Prince", "Augusti Marys Priyadarshini"].every((n) => db.users.some((u) => u.name === n)), "directors present");
check(db.offices.some((o) => o.kind === "REGISTERED" && o.name.includes("Mumbai")) && db.offices.some((o) => o.kind === "BRANCH" && o.name.includes("Chennai")), "registered office Mumbai, branch Chennai");
check(["NTPC Korba", "CSPGCL Korba West", "MSPGCL Chandrapur", "MSPGCL Koradi"].every((n) => db.sites.some((s) => s.name === n)), "named plant sites present");
console.log("employees", db.employees.length);
check(db.employees.length >= 140 && db.employees.length <= 170, "about 150 employees");
const tenderValues = db.tenders.map((t) => Number(toPaise(t.estimatedValue)) / 100);
check(Math.min(...tenderValues) >= 3_000_000 && Math.max(...tenderValues) <= 150_000_000, "tender estimates between Rs 30 L and Rs 15 Cr");
check(db.tenders.every((t) => t.workDescription && t.eligibility && t.openingDate && t.organisationId), "tenders carry organisation, work description, eligibility and opening date");

// Stage distribution and win rate
const byStage: Record<string, number> = {};
db.tenders.forEach((x) => {
  const n = db.tenderStages.find((s) => s.id === x.currentStageId)!.name;
  byStage[n] = (byStage[n] ?? 0) + 1;
});
console.log(byStage);
const won = byStage["Won"] ?? 0;
const lost = byStage["Lost"] ?? 0;
console.log("win rate", Math.round((won / (won + lost)) * 100) + "%");

// The Rs 50 L package with three subcontractors
const p10 = db.projects.find((p) => p.id === "prj_p10_kpcl_pkg")!;
check(p10.contractValue === "5000000.00", "Raichur package contract value is exactly Rs 50,00,000");
const p10Orders = listSubcontractorAssignments(db, { projectId: p10.id });
check(p10Orders.length === 3 && ["Civil", "Stone Picking", "Painting"].every((t) => p10Orders.some((o) => o.trade === t)), "Rs 50 L project has Civil, Stone Picking and Painting subcontractors");
p10Orders.forEach((o) => console.log("  ", o.trade, o.subcontractorName, formatINR(o.contractValue), `${o.progressPct.toFixed(0)}%`, "billed", formatINR(o.billed, { compact: "auto" }), "paid", formatINR(o.paid, { compact: "auto" }), "balance", formatINR(o.balance, { compact: "auto" }), o.lastPaymentDate));

// Projects: BOQ ties to contract, health spread
for (const row of listProjects(db)) {
  const p = row.project;
  const boqTotal = sumMoney(db.boqItems.filter((b) => b.projectId === p.id).map((b) => b.amount));
  const billing = getProjectBilling(db, p.id);
  console.log(p.code, p.contractType, p.billingCycle, formatINR(p.contractValue, { compact: true }), "boq==contract", boqTotal === p.contractValue, row.health, `${row.progressPct.toFixed(0)}%/${row.plannedPct.toFixed(0)}%`, "invoiced", formatINR(billing.invoicedTotal, { compact: true }), "outstanding", formatINR(billing.outstanding, { compact: true }));
  check(boqTotal === p.contractValue, `${p.code}: BOQ sums to contract value`);
}
const units = new Set(db.boqItems.map((b) => b.unit));
console.log("BOQ units", [...units].join(", "));

// Invoices and GST
const igst = db.invoices.filter((i) => Number(i.igst) > 0).length;
const intra = db.invoices.filter((i) => Number(i.cgst) > 0).length;
console.log("invoices", db.invoices.length, "intra-state", intra, "inter-state (IGST)", igst);
check(igst > 0 && intra > 0, "invoices include both CGST+SGST and IGST");
check(db.invoices.every((i) => toPaise(i.total) === toPaise(i.taxableValue) + toPaise(i.cgst) + toPaise(i.sgst) + toPaise(i.igst)), "invoice total = taxable + taxes");
check(db.invoices.every((i) => toPaise(i.netReceivable) === toPaise(i.total) - toPaise(i.totalDeductions)), "invoice net = total - deductions");
const gstf = getGstFilingSummary(db);
console.log("GST filing", { filed: gstf.filed, pending: gstf.pending, overdue: gstf.overdue });
check(gstf.pending > 0 && gstf.overdue > 0, "some GST filing pending, one overdue");
const recv = getReceivablesSummary(db);
console.log("receivables", formatINR(recv.total, { compact: true }), "overdue", formatINR(recv.overdue, { compact: true }), recv.overdueCount);
check(recv.overdueCount > 0, "some overdue customer payments");

// Employees: salary, advance, deductions, PF, ESI, net, payment status
const pay = listEmployeePay(db, "2026-09").filter((r) => r.payslip);
const sample = pay.find((r) => Number(r.profile.advanceBalance) > 0 && r.payslip!.esiEmployee !== "0.00")!;
console.log("pay sample", sample.employee.name, sample.designation, "salary", sample.profile.wageAmount, "advance bal", sample.profile.advanceBalance, "deductions", sample.payslip!.totalDeductions, "PF", sample.payslip!.epfEmployee, "ESI", sample.payslip!.esiEmployee, "net", sample.payslip!.net, sample.payslip!.paymentStatus);
check(pay.every((r) => toPaise(r.payslip!.net) === toPaise(r.payslip!.gross) - toPaise(r.payslip!.totalDeductions)), "net salary = gross - total deductions");
check(new Set(pay.map((r) => r.payslip!.paymentStatus)).size >= 2, "payment status varies (paid / pending)");

// Approvals / notifications
console.log("pending approvals", db.approvalSteps.filter((s) => s.status === "PENDING").length, "notifications", db.notifications.length);

// Reference integrity (spot)
const ids = (arr: { id: string }[]) => new Set(arr.map((x) => x.id));
const refs = (name: string, values: (string | null | undefined)[], valid: Set<string>) =>
  check(values.every((r) => !r || valid.has(r)), `refs: ${name}`);
refs("project.organisation", db.projects.map((p) => p.organisationId), ids(db.organisations));
refs("project.site", db.projects.map((p) => p.siteId), ids(db.sites));
refs("project.serviceLine", db.projects.map((p) => p.serviceLineId), ids(db.serviceLines));
refs("tender.serviceLine", db.tenders.map((t) => t.serviceLineId), ids(db.serviceLines));
refs("tender.site", db.tenders.map((t) => t.siteId), ids(db.sites));
refs("site.organisation", db.sites.map((s) => s.organisationId), ids(db.organisations));
refs("attendance.employee", db.attendance.map((a) => a.employeeId), ids(db.employees));
refs("attendance.site", db.attendance.map((a) => a.siteId), ids(db.sites));
refs("invoice.project", db.invoices.map((i) => i.projectId), ids(db.projects));
refs("payment.invoice", db.payments.map((p) => p.invoiceId), ids(db.invoices));
refs("workOrder.subcontractor", db.workOrders.map((w) => w.subcontractorId), ids(db.subcontractors));
refs("approval.assignee", db.approvalSteps.map((s) => s.assignedUserId), ids(db.users));
refs("pbg.project", db.securityInstruments.map((s) => s.projectId), ids(db.projects));
refs("notification.user", db.notifications.map((n) => n.userId), ids(db.users));
refs("project.manager", db.projects.map((p) => p.projectManagerId), ids(db.employees));

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
