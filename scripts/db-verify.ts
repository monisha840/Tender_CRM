/**
 * Verifies the hardening migration against the dev/test database (guarded like db-reset):
 *  - audit rows cannot be UPDATEd / DELETEd / TRUNCATEd normally (as the app role)
 *  - with app.allow_audit_reset='on' inside a transaction, delete works (and the setting does not leak)
 *  - RLS on every table, no policies; anon/authenticated cannot read app tables
 *  - Payment 'one allocation target' CHECK rejects two targets
 *  - a soft-deleted row frees its business-unique key (partial unique index)
 * Leaves no rows behind. Run: npm run db:verify
 */
import { PrismaClient } from "@prisma/client";
import { assertSafeToReset } from "./db-reset";

const prisma = new PrismaClient();
let failed = 0;
const ok = (name: string, pass: boolean, info = "") => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${info ? "  (" + info + ")" : ""}`);
  if (!pass) failed++;
};
async function rejects(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? (e.message.trim().split("\n").pop() ?? "error") : "error";
  }
}

async function main() {
  assertSafeToReset();
  const tag = `verify-${Date.now()}`;
  const row = await prisma.auditLog.create({ data: { actorType: "SYSTEM", action: tag, entityType: "Verify", entityId: tag, summary: "verify" } });

  ok("AuditLog UPDATE blocked", (await rejects(() => prisma.auditLog.update({ where: { id: row.id }, data: { summary: "x" } }))) !== null);
  ok("AuditLog DELETE blocked", (await rejects(() => prisma.auditLog.delete({ where: { id: row.id } }))) !== null);
  ok("AuditLog TRUNCATE blocked", (await rejects(() => prisma.$executeRawUnsafe(`TRUNCATE TABLE "AuditLog"`))) !== null);
  ok("AuditLog row still present", (await prisma.auditLog.count({ where: { action: tag } })) === 1);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.allow_audit_reset', 'on', true)`;
    await tx.auditLog.delete({ where: { id: row.id } });
  });
  ok("DELETE works with app.allow_audit_reset=on in a transaction", (await prisma.auditLog.count({ where: { action: tag } })) === 0);
  const leak = await prisma.$queryRaw<{ v: string | null }[]>`SELECT current_setting('app.allow_audit_reset', true) AS v`;
  ok("setting does not leak outside the transaction", leak[0].v !== "on", String(leak[0].v));

  const trg = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE 'ApprovalAction_append_only%'`;
  ok("ApprovalAction append-only triggers installed", trg[0].n === 2);

  const noRls = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT c.relname AS tablename FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`;
  ok("RLS enabled on every public table", noRls.length === 0, noRls.map((r) => r.tablename).join(","));
  const pol = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`;
  ok("no policies defined", pol[0].n === 0);

  for (const role of ["anon", "authenticated"]) {
    const err = await rejects(() =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        await tx.$queryRawUnsafe(`SELECT count(*) FROM "Tender"`);
      }),
    );
    ok(`${role} cannot read Tender`, err !== null, err ?? "");
  }
  const me = await prisma.$queryRaw<{ u: string; bypass: boolean }[]>`SELECT current_user AS u, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
  ok("app role bypasses RLS", me[0].bypass === true, me[0].u);

  // Payment CHECK fires before FK checks, so dummy ids are enough.
  const region = await prisma.region.findFirst();
  if (region) {
    const err = await rejects(() =>
      prisma.payment.create({
        data: { direction: "OUT", purpose: "SUBCONTRACTOR", amount: 1, paidOn: new Date(), mode: "CASH", regionId: region.id, invoiceId: "x", subcontractorBillId: "y" },
      }),
    );
    ok("Payment with two allocation targets rejected", err !== null && /Payment_one_allocation_target_chk|check/i.test(err), err ?? "");
  } else {
    ok("Payment CHECK skipped (no region; run seed first)", true);
  }

  // Partial unique: same GSTIN twice fails, but succeeds after the first is soft-deleted.
  const st = await prisma.state.findFirst();
  if (st) {
    const gstin = `ZZ${Date.now()}`.slice(0, 15);
    const mk = (id: string) => ({ id, gstin, stateId: st.id, legalName: "verify", panNumber: "VERIFY0000X", address: "verify" });
    const a = await prisma.gstRegistration.create({ data: mk(`vg1_${tag}`) });
    const dup = await rejects(() => prisma.gstRegistration.create({ data: mk(`vg2_${tag}`) }));
    ok("duplicate non-deleted GSTIN rejected", dup !== null, dup ?? "");
    await prisma.gstRegistration.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
    const again = await rejects(() => prisma.gstRegistration.create({ data: mk(`vg3_${tag}`) }));
    ok("GSTIN reusable after soft delete", again === null, again ?? "");
    await prisma.gstRegistration.deleteMany({ where: { gstin } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    failed++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
    process.exit(failed ? 1 : 0);
  });
