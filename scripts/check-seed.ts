import { buildSeedDatabase } from "@/lib/data/seed";
import { formatINR, sumMoney, toPaise } from "@/lib/money";

const db = buildSeedDatabase();
const counts = Object.fromEntries(Object.entries(db).map(([k, v]) => [k, (v as unknown[]).length]));
console.log(JSON.stringify(counts));
console.log("json size KB", Math.round(JSON.stringify(db).length / 1024));

// duplicate ids per table
for (const [k, rows] of Object.entries(db)) {
  const ids = new Set<string>();
  for (const r of rows as { id: string }[]) {
    if (ids.has(r.id)) console.log("DUP", k, r.id);
    ids.add(r.id);
  }
}
// determinism
const again = buildSeedDatabase();
console.log("deterministic", JSON.stringify(db) === JSON.stringify(again));

// flagship
const t = db.tenders.find((x) => x.id === "tnd_korba_road")!;
const bid = db.bids.find((x) => x.tenderId === t.id)!;
const emd = db.securityInstruments.find((x) => x.tenderId === t.id && x.type === "EMD")!;
console.log("flagship", formatINR(t.estimatedValue), formatINR(emd.amount), formatINR(bid.quotedAmount), bid.isL1, bid.technicalResult, db.tenderStages.find((s) => s.id === t.currentStageId)!.name);

// stage dist
const byStage: Record<string, number> = {};
db.tenders.forEach((x) => { const n = db.tenderStages.find((s) => s.id === x.currentStageId)!.name; byStage[n] = (byStage[n] ?? 0) + 1; });
console.log(byStage);
const won = db.tenders.filter((x) => db.tenderStages.find((s) => s.id === x.currentStageId)!.kind === "WON").length;
const lost = db.tenders.filter((x) => db.tenderStages.find((s) => s.id === x.currentStageId)!.kind === "LOST").length;
console.log("win rate", won, lost, Math.round((won / (won + lost)) * 100) + "%");

// projects
for (const p of db.projects) {
  const boq = db.boqItems.filter((b) => b.projectId === p.id);
  const boqTotal = sumMoney(boq.map((b) => b.amount));
  const executed = boq.reduce((a, b) => a + Number(b.executedQty) * Number(b.rate), 0);
  const contract = Number(toPaise(p.contractValue)) / 100;
  const pct = (executed / contract) * 100;
  const start = new Date(p.startDate!).getTime(), end = new Date(p.plannedEndDate!).getTime();
  const exp = ((new Date("2026-10-07").getTime() - start) / (end - start)) * 100;
  console.log(p.code, formatINR(p.contractValue), "boq==contract", boqTotal === p.contractValue, "actual%", pct.toFixed(1), "expected%", exp.toFixed(1), "gap", (exp - pct).toFixed(1));
}

// money
const emdLocked = sumMoney(db.securityInstruments.filter((s) => s.type === "EMD" && ["ARRANGED", "SUBMITTED"].includes(s.status)).map((s) => s.amount));
const recv = db.raBills.reduce((a, b) => a + Number(b.netPayable) - Number(b.receivedAmount), 0);
const overdue = db.raBills.filter((b) => b.dueDate < "2026-10-07" && Number(b.receivedAmount) < Number(b.netPayable));
console.log("EMD locked", formatINR(emdLocked, { compact: true }), "receivables", formatINR(recv.toFixed(2), { compact: true }), "overdue bills", overdue.length);
const pay = db.vendorInvoices.reduce((a, b) => a + Number(b.total) - Number(b.paidAmount), 0) + db.subcontractorBills.reduce((a, b) => a + Number(b.netPayable) - Number(b.paidAmount), 0);
console.log("payables", formatINR(pay.toFixed(2), { compact: true }));
const pending = db.approvalSteps.filter((s) => s.status === "PENDING");
console.log("pending approvals", pending.length, db.approvalRequests.filter((r) => r.status === "PENDING").map((r) => r.entityType).join(","));
console.log("notifications", db.notifications.length, "unread", db.notifications.filter((n) => !n.readAt).length);

// today's flagship report
const rep = db.dailyReports.find((r) => r.siteId === "site_korba_road_1" && r.reportDate === "2026-10-07")!;
console.log("flagship report", rep.workersCount, rep.issues, db.dailyWorkItems.filter((i) => i.reportId === rep.id));

// reference integrity (spot)
const ids = (arr: { id: string }[]) => new Set(arr.map((x) => x.id));
const check = (name: string, refs: string[], valid: Set<string>) => refs.forEach((r) => { if (r && !valid.has(r)) console.log("BROKEN", name, r); });
check("project.client", db.projects.map((p) => p.clientId), ids(db.clients));
check("project.gst", db.projects.map((p) => p.gstRegistrationId), ids(db.gstRegistrations));
check("site.incharge", db.sites.map((s) => s.inchargeId ?? ""), ids(db.employees));
check("att.emp", db.attendance.map((a) => a.employeeId), ids(db.employees));
check("po.vendor", db.purchaseOrders.map((p) => p.vendorId), ids(db.vendors));
check("sbill.wo", db.subcontractorBills.map((b) => b.workOrderId), ids(db.workOrders));
check("pay.ra", db.payments.map((p) => p.raBillId ?? ""), ids(db.raBills));
check("apr.ent", db.approvalSteps.map((s) => s.assignedUserId ?? ""), ids(db.users));
check("pbg.project", db.securityInstruments.map((s) => s.projectId ?? ""), ids(db.projects));
check("ntf.user", db.notifications.map((n) => n.userId), ids(db.users));
check("pm", db.projects.map((p) => p.projectManagerId ?? ""), ids(db.employees));
