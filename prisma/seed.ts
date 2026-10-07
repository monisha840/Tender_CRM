/**
 * Seed entry point (wired as `prisma db seed` in package.json).
 *
 *   npm run db:seed                  -> base masters only (same as seed-base.ts)
 *   SEED_DEMO=true npm run db:seed   -> base masters + the deterministic demo dataset
 *
 * The demo dataset is the existing mock seed (src/lib/data/seed, PRNG seed 20261007, fixed demo "today"),
 * ported table by table so the dashboard and every screen look realistic on a dev/test database.
 * (Ships with demo data; a later isDemo marker + db:clear-demo removes it. Only db-reset is guarded.)
 *
 * Mapping notes
 *  - Tables owned by seed-base (states, regions, GSTINs, roles, permissions, stages, masters) are skipped here.
 *  - Minimal 2-role scope: only the mock Director users are kept, plus one demo System Admin (usr_admin).
 *    Other personas are dropped; records they owned are re-pointed to the admin/director (see KEPT_ROLES). Demo users have no Supabase Auth account (authUserId null);
 *    S2 creates real logins for the six production users.
 *  - Field names in the mock types equal the Prisma field names, so rows are inserted as-is; only
 *    DateTime fields are converted from ISO strings to Date (driven by Prisma's datamodel metadata).
 *  - AuditLog.id is auto-increment (BigInt), so the mock string id is dropped.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { buildSeedDatabase } from "../src/lib/data/seed";
import type { Database } from "../src/types";
import { roleId, seedBase } from "./seed-base";

/** Insert order (parents before children). [Database key, Prisma model]. */
const DEMO_TABLES: [keyof Database, Prisma.ModelName][] = [
  ["organisations", "Organisation"],
  ["tenderPortals", "TenderPortal"],
  ["materials", "Material"],
  ["users", "User"],
  ["userRoles", "UserRole"],
  ["userRegions", "UserRegion"],
  ["employees", "Employee"],
  ["parties", "Party"],
  ["subcontractors", "Subcontractor"],
  ["vendors", "Vendor"],
  ["employeeProfiles", "EmployeeProfile"],
  ["sites", "Site"],
  ["tenders", "Tender"],
  ["tenderStageHistory", "TenderStageHistory"],
  ["tenderDocumentItems", "TenderDocumentItem"],
  ["approvalRequests", "ApprovalRequest"],
  ["approvalSteps", "ApprovalStep"],
  ["approvalActions", "ApprovalAction"],
  ["goNoGoDecisions", "GoNoGoDecision"],
  ["bids", "Bid"],
  ["bidClarifications", "BidClarification"],
  ["competitorBids", "CompetitorBid"],
  ["tenderAwards", "TenderAward"],
  ["awardConditions", "AwardCondition"],
  ["projects", "Project"],
  ["projectConversions", "ProjectConversion"],
  ["securityInstruments", "SecurityInstrument"],
  ["securityInstrumentEvents", "SecurityInstrumentEvent"],
  ["projectMembers", "ProjectMember"],
  ["progressSnapshots", "ProjectProgressSnapshot"],
  ["boqItems", "BoqItem"],
  ["projectBudgetLines", "ProjectBudgetLine"],
  ["dailyReports", "DailyWorkReport"],
  ["dailyWorkItems", "DailyWorkItem"],
  ["siteIssues", "SiteIssue"],
  ["workOrders", "SubcontractorWorkOrder"],
  ["subcontractorBills", "SubcontractorBill"],
  ["subcontractorBillDeductions", "SubcontractorBillDeduction"],
  ["costEntries", "CostEntry"],
  ["siteAssignments", "SiteAssignment"],
  ["attendance", "Attendance"],
  ["payrollRuns", "PayrollRun"],
  ["payslips", "Payslip"],
  ["purchaseRequests", "PurchaseRequest"],
  ["purchaseRequestItems", "PurchaseRequestItem"],
  ["purchaseOrders", "PurchaseOrder"],
  ["vendorInvoices", "VendorInvoice"],
  ["stockTransactions", "StockTransaction"],
  ["invoices", "Invoice"],
  ["invoiceDeductions", "InvoiceDeduction"],
  ["payments", "Payment"],
  ["retentionEntries", "RetentionEntry"],
  ["gstTransactions", "GstTransaction"],
  ["documents", "Document"],
  ["documentLinks", "DocumentLink"],
  ["notifications", "Notification"],
  ["auditLogs", "AuditLog"],
];

/**
 * Minimal 2-role scope: only Director and System Admin demo users are kept. The mock seed's other personas
 * (tender exec, regional heads, PMs, accounts, site staff) are dropped as login users; their employee records stay
 * (userId set to null) and every user reference they owned is re-pointed to the demo admin (data entry) or to the
 * first kept Director (approver/decider fields).
 */
const KEPT_ROLES = new Set(["director"]);
const ADMIN_USER = "usr_admin";
const APPROVER_FIELD = /^(assignedUserId|decidedById|reviewedById|convertedById|approverId|actorId)$/;

function toPrismaRow(model: Prisma.ModelName, row: Record<string, unknown>): Record<string, unknown> {
  const meta = Prisma.dmmf.datamodel.models.find((m) => m.name === model)!;
  const out: Record<string, unknown> = {};
  for (const f of meta.fields) {
    if (f.kind === "object" || !(f.name in row)) continue;
    const v = row[f.name];
    out[f.name] = f.type === "DateTime" && typeof v === "string" ? new Date(v) : v;
  }
  return out;
}

function delegateOf(prisma: PrismaClient, model: Prisma.ModelName) {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  return (prisma as unknown as Record<string, { createMany(a: { data: object[]; skipDuplicates?: boolean }): Promise<{ count: number }> }>)[key];
}

async function seedDemo(prisma: PrismaClient) {
  const db = buildSeedDatabase();

  const keptDirectors = db.users.filter((u) => {
    const ur = db.userRoles.find((r) => r.userId === u.id);
    return ur && KEPT_ROLES.has(String(ur.roleId).replace(/^role_/, ""));
  });
  const keptIds = new Set<string>([ADMIN_USER, ...keptDirectors.map((u) => u.id as string)]);
  const directorId = keptDirectors[0].id as string;
  /** Re-point a reference to a dropped persona at a kept user. */
  const remap = (field: string, v: unknown) =>
    typeof v === "string" && v.startsWith("usr_") && !keptIds.has(v) ? (APPROVER_FIELD.test(field) ? directorId : ADMIN_USER) : v;

  await prisma.user.upsert({
    where: { id: "usr_admin" },
    update: {},
    create: { id: "usr_admin", name: "System Administrator", email: "admin@sprince.example", isActive: true },
  });
  await prisma.userRole.upsert({
    where: { id: "ur_admin" },
    update: {},
    create: { id: "ur_admin", userId: "usr_admin", roleId: roleId("system_admin") },
  });

  for (const [dbKey, model] of DEMO_TABLES) {
    let rows = (db[dbKey] as unknown as Record<string, unknown>[]).map((r) => ({ ...r }));
    if (dbKey === "users") rows = rows.filter((r) => keptIds.has(r.id as string));
    if (dbKey === "userRoles") rows = rows.filter((r) => keptIds.has(r.userId as string) && KEPT_ROLES.has(String(r.roleId).replace(/^role_/, "")));
    if (dbKey === "userRegions") rows = rows.filter((r) => keptIds.has(r.userId as string));
    if (dbKey === "employees") rows = rows.map((r) => (keptIds.has(r.userId as string) ? r : { ...r, userId: null }));
    if (dbKey !== "users" && dbKey !== "userRoles" && dbKey !== "userRegions") {
      rows = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, remap(k, v)])));
    }
    if (dbKey === "auditLogs") rows.forEach((r) => delete r.id);

    const data = rows.map((r) => toPrismaRow(model, r));
    const delegate = delegateOf(prisma, model);
    for (let i = 0; i < data.length; i += 1000) {
      await delegate.createMany({ data: data.slice(i, i + 1000), skipDuplicates: true });
    }
    console.log(`  ${model}: ${data.length}`);
  }
}

/** Seed base masters, plus the demo dataset when `demo` is true. Reused by scripts/db-reset.ts. */
export async function seedAll(prisma: PrismaClient, opts: { demo: boolean }) {
  console.log("Seeding base masters...");
  await seedBase(prisma);
  if (opts.demo) {
    console.log("Seeding demo data (SEED_DEMO=true)...");
    await seedDemo(prisma);
  } else {
    console.log("Demo data skipped (set SEED_DEMO=true to load it).");
  }
  console.log("Done.");
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedAll(prisma, { demo: process.env.SEED_DEMO === "true" });
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed directly (prisma db seed / tsx prisma/seed.ts), not when imported.
const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
if (/\/seed\.(ts|js)$/.test(entry)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
