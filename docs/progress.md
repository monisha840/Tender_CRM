# Progress log (resume from here)

Run: build + test to production quality, no deployment. Orchestrator prompt: build stages S1–S4-build, test stage T1/T2, bug-fix loop, docs/test-report.md.

## Decisions
- D1 (user): Data layer = Prisma (schema, migrations, all queries, direct Postgres via DATABASE_URL). supabase-js/ssr only for Auth + Storage (src/lib/supabase/). scripts/db.mjs and SQL-migration approach dropped. CLAUDE.md updated.
- D2: Env file is `.env.local` (gitignored); Prisma/test scripts load it via dotenv-cli. APP_ENV=development and E2E_TEST_PASSWORD set there; all keys (no values) in .env.example.
- D3: go-live-plan.md and client PDF moved to docs/ (client-requirements.pdf).
- Deployment out of scope (S3-D, S4 deploy steps skipped).
- D4 (user): Schema approved (commit 60fedc7) with one change: model WorkOrderItem added (optional work order line items; bills do not reference it yet).
- D5: Dev Supabase project is in Tokyo (ap-northeast-1): fine for dev/test only. The production Supabase project MUST be created in Mumbai (ap-south-1).
- D6: Business-unique keys on soft-deletable tables are partial unique indexes (hardening migration) and are not declared in schema.prisma (Prisma would report drift); use findFirst with deletedAt null. See docs/data-model.md.

- D7 (S1b): One `LoadScope` and one conversion module (`src/lib/data/server/convert.ts`). `loadDatabaseForUser` derives scope from the user context and passes it to every loader. Types now carry `OWN_RECORDS`, `DELETE`, `REVIEW`, `Database.approvalThresholds`, Project clause fields and optional `version/createdById/updatedById/clientUuid`.
- D8 (S1b): Dev DB is shared with parallel agents (Playwright global setup resets it). Do not run db:reset while another agent runs e2e. The loaders fan out many parallel queries; on the Supabase session pooler use `connection_limit` (about 4) in the Prisma URL or the pool times out.

## Scope change (minimal 2-role version)
Scope change from the user: ship a minimal version. Only two roles: System Admin (enters data, submits) and Director (views everything, approves). No region/project scope filtering and no approval thresholds; every approval is one step to the Director, maker-checker kept (Admin cannot approve). Modules in scope: Dashboard, Tenders end to end (create, edit, stages, GO/NO-GO approval, convert to project with Director approval), Projects and Subcontractors create/edit/view. Daily work, Finance/GST and Employees/Payroll hidden behind the feature flag. Deferred: subcontractor bills/payments, EMD/PBG lifecycle, document uploads, email, user admin screen, audit viewer, Excel import, user guides.

## Stages
| Stage | Status | Branch | Commits | Notes |
|---|---|---|---|---|
| Setup baseline | done | main | see git log | WIP committed, docs moved |
| S1a schema, migrations, seeds | done | main | 60fedc7 (design), see git log for migrations commit | Migrations init + hardening + align_schema_uniques applied to dev DB; seeds run; `npm run db:reset`, `npm run db:verify` added |
| S1b loaders merged + unified | done | main | see git log (merges "Merge platform loaders" .. "Merge finance/workforce loaders", then "S1b: unify loaders") | Four loader branches merged, one convert module, DEFAULT_LOADERS wired (8 slots), integration test against dev DB. Screen-by-screen swap away from the Zustand store is NOT started (next stage). |
| S2 auth/RBAC/audit/approvals | todo | | | |
| S3-A tenders | todo | build/s3a-tenders | | |
| S3-B projects+subs | todo | build/s3b-projects-subs | | |
| S3-C dashboard+admin | todo | build/s3c-dashboard-admin | | |
| S4-build (import, guides, security) | todo | | | |
| T1 test foundation | todo | | | |
| T2-A/B/C/D suites | todo | | | |
| Bug-fix loop | todo | | | |
| test-report.md | todo | | | |

## Open questions
- Real GSTINs needed: seed-base uses placeholder GSTINs (valid checksum, derived from company PAN). Replace before real use.

## Latest test run
S1b: lint clean, tsc clean, vitest 19 files / 247 passed + 6 todo (includes tests/integration/load-database.test.ts against the dev DB).

## Scope update 2 (decisions D9-D13)
- D9 Users: the System Admin and Director logins use the EXISTING seeded names/emails (demo users); no new users. e2e must link Supabase Auth accounts to those seeded User rows (replaces the test.sprince.local users from T1).
- D10 No real starting data. All mock/demo data kept (incl. Employees/Payroll and GST/Finance demo records, hidden behind PHASE67 flag); only dropped roles' personas are removed. App ships WITH demo data. Seeded records carry an isDemo marker; guarded script `db:clear-demo` removes only demo records when the client starts real use. This REPLACES the rule "demo seed never in production".
- D11 Deployment target = Vercel (not Hostinger VPS); still no deployment work in this run. Build compatibly: no long-running worker (no pg-boss); deadline notifications computed on read or via a cron-callable API route secured with a secret; Prisma uses the Supabase pooled connection (pgbouncer=true) at runtime and DIRECT_URL only for migrations; nothing writes to the local filesystem at runtime.
- D12 GSTINs stay placeholders, clearly marked as placeholders in settings; real ones entered later without code changes.

## Scope update 3 (decisions D13-D19): final cut
- S2 kept: login/logout, route protection, server-side permission checks, audit writes, Director approval with maker-checker. Password-reset UI and custom rate limiting are dropped (admin resets in the Supabase dashboard; rely on Supabase Auth limits) — already-built pages/limiter are left unused/unlinked, no further work.
- S3 two agents: (1) Tenders end to end (create, edit, stages, GO/NO-GO approval, Won, convert to project with Director approval); (2) Dashboard on real data + Projects and Subcontractors VIEW-ONLY from the DB (no create/edit forms).
- Stored notifications dropped; keep computed deadline badges and the bell.
- isDemo marker and db:clear-demo DEFERRED (demo data still ships).
- Review: one final review agent only.
- Playwright smoke suite only: login Admin+Director; Admin blocked from approving incl. direct server call; tender create -> GO approved by Director -> Won -> convert -> project visible; dashboard loads with active-tenders count == DB; desktop crawl of every page for console errors; mobile 360px check of dashboard + tender list only.
- Bug loop: fix high-severity/blocking only, log the rest; exit after one fully green run. Test report short.

## Parallel-stage database rule (D20)
Dev DB is shared. Build agents (S3-A, S3-B, test writer, reviewer) must NOT run db:reset, seeds or Playwright; they use typecheck, lint, unit tests and build only (DB-backed vitest tests may only create/delete their own rows). After merging S3-A, S3-B and the e2e specs, the orchestrator alone runs db:reset and the Playwright suite, then dispatches bug fixes in parallel by module. Agents running: S3-A tenders, S3-B dashboard+projects/subs view-only, test writer (smoke specs), S2 security reviewer (read-only).
