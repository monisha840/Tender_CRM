# Test report — S. Prince Management Tool (minimal two-role version)

Date: 2026-10-08. Dev/test Supabase project only; nothing deployed.

## Status: NOT fully green
Last full Playwright run (desktop 1280 + mobile 360): **14 passed, 4 failed, 18 skipped, 2 did not run.** The agreed exit criterion (one fully green run) was **not** met. Per instruction the four failures were not investigated further; they are listed below with what is known.

## What works (built and merged)
- Supabase login/logout, route protection (proxy), server-side permission checks (`runAction` + `assertCan`), audit written in the same transaction, one-step Director approval with maker-checker (Admin cannot approve).
- Tenders end to end: create, edit, soft delete, stage moves, GO/NO-GO request and Director decision, Won/Lost with reason, conversion to project with Director approval (9 DB-backed integration tests pass).
- Dashboard on real database data (active tenders KPI = DB count: 19 = 19), computed deadline badges and bell (no stored notifications).
- Projects and Subcontractors: view-only from the database. Approvals inbox shows tender approval types only.
- Daily work, Finance/GST and Employees/Payroll hidden behind the PHASE67 flag (off in production). Demo data ships with the app.
- Self-check done: no secrets (service-role key, DB URL, test password) in the client bundle; role switcher absent from the build and allow-listed to development/test; all tender and approval server actions go through the permission-checked, audited wrapper.

## What is tested
- Vitest unit + DB integration (loaders, approvals/audit, tenders flow, server snapshot, feature flag, auth helpers): passing at last check (the flag test was fixed to not depend on local env).
- Playwright smoke (tests/e2e/smoke): auth, Admin-cannot-approve incl. forged server call, tender flow, dashboard KPI, Phase 1 page crawl for both roles, 360px dashboard/tender list.
- Passing in the last run: both logins, dashboard KPI, Phase 1 crawl (both roles), mobile checks, and the earlier tender-flow steps.

## Failing in the last run (not investigated further)
1. `approvals-rbac`: fixture flagged `ERR_ABORTED` on a `/tenders/<id>` request (likely a navigation abort that the checker's allow-list does not cover).
2. `auth` sign out: 404s on `/login?_rsc=…` prefetches after sign-out.
3. `auth` wrong password: `ERR_ABORTED` on `/login`.
4. `tender-flow` "Admin marks Won": the `stage-advance` button stays disabled (the step after GO approval does not advance the tender to a state that enables it), so Won, conversion and project-visible steps did not run. This is the one most likely to be a real app or data-refresh issue (server snapshot cache vs. stage change); the first three look like test-checker noise.
Bug details: docs/bug-log.md.

## Known issues / not done
- Server-side redirect for inactive users and forced password change is client-side only (low impact today).
- Sign-out uses global scope (revokes all of a user's sessions); local scope is a one-line change left to the owner's decision.
- Login rate limiter is in-memory (ineffective on serverless); rely on Supabase Auth limits. Password-reset UI exists but is unlinked/out of scope.
- 360px tender list: mobile cards lack the `tender-row` test id (logged).
- Seeded non-tender approvals are hidden, not decidable.
- Server data cache: writes outside `runAction` show after up to 30 s.
- Placeholder GSTINs; dev DB is in Tokyo — production Supabase project must be in Mumbai.
- Deferred by scope: user admin screen, audit viewer, uploads, EMD/PBG lifecycle, subcontractor bills/payments, Excel import, user guides, isDemo marker + db:clear-demo, final review agent.
- Not deployed. Deployment (Vercel) will need: a clean Mumbai Supabase project, pooled `DATABASE_URL` (+ `DIRECT_URL` for migrations; add `directUrl` to the Prisma schema), a cron secret if scheduled notifications are added, domain/SMTP.
