# Audit v3: what is still missing for a production-grade CRM

Date: 2026-10-08. Read-only audit: no code, database or settings were changed. Nine read-only agents covered the areas below; one crawled the live site (https://sprince-crm.vercel.app) as System Admin and as Director without saving anything.

**Legend:** ✅ Working · 🟡 Partial · 🎭 UI or mock only (looks like it works, nothing reaches the database) · ❌ Missing.
**Method note:** ✅ means verified in code. Where a live check was also possible it is noted. Live-site checks were read-only (page loads, buttons visible, forms opened and cancelled), so no save was exercised on the live site. The work-in-progress code that another agent is writing (projects/subcontractors forms, enhancement migration) is reported as it exists on disk, not as deployed.

---

## 1. Executive summary

### How complete is it? (estimate)

| Measure | Estimate |
|---|---|
| Client's core brief (docs/client-requirements.pdf), writes AND reads working against the DB | **about 30%** (Tenders, Projects, Approvals; Subcontractor master once deployed) |
| Client's brief, screens present (including mock screens) | about 70% |
| Production-grade CRM as specified in CLAUDE.md / go-live plan (security, ops, mobile/field, integrations, all phases) | **about 25-30%** |

These are judgement estimates from the item counts in the tables below, not measurements. The cleanest way to read them: the app is a convincing, well-built **read-only demonstration with one real workflow** (tender, GO/NO-GO approval, won, project). Everything else a user can "save" is stored only in their own browser.

### Verification run (safe checks)

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass, 0 errors, 7 warnings (unused variables) |
| Unit tests (`vitest run src`) | 257 passed, 6 todo, 21 files |
| `npm run build` | Pass (443 pages generated) |
| Integration tests (own rows only, cleaned up) | The new projects/subcontractors test passed 5 of 5 earlier today. In a full run, one load-database test failed on table row counts and passed when re-run alone: it is sensitive to other tests writing to the shared DB. |
| Playwright | Not run (instructed). Last recorded run in docs/test-report.md: 14 passed, 4 failed; the Won, convert and project steps never ran. |

### Top 10 gaps

1. **Silent data loss.** Daily reports, attendance, employees, invoices, payments and Settings "Add" forms show a success message but save only to browser storage. The live site has these screens switched on. Staff will believe data is saved when it is not.
2. **Production database is demo data plus test pollution.** Live and dev/test share one Supabase project. It holds seeded demo data (156 employees, 50 tenders, 918 payslips) and about 10 `E2E/…` tenders left by test runs. There is no way to separate demo from real data (no `isDemo`, no `db:clear-demo`).
3. **No backups or tested restore, no CI, no error monitoring, no uptime check.** Every push to `main` deploys; migrations are applied by hand.
4. **Subcontractor bills, payments, work orders, employees, payroll, GST invoices, purchases, daily reports** have no real write path. The dashboard figures for them cannot become real.
5. **Whole-database snapshot is embedded in every page** (about 1 MB now, no per-role filtering). It includes party PAN unmasked, and employee/salary data when the finance/payroll flag is on. This is both a privacy risk and the main scalability limit.
6. **No security headers, in-memory login rate limit (useless on Vercel), no audit-log viewer, no DPDP controls.**
7. **Field workers cannot use it yet.** No PWA (no manifest, no service worker), no offline drafts, no photo upload or compression, no site-staff roles in the database, no Hindi/Tamil/Marathi.
8. **No document storage.** The tender checklist and project documents cannot hold files; no Supabase Storage code exists.
9. **No notifications or reminders out of the app.** No email, WhatsApp, cron route or health endpoint; deadline alerts exist only while someone has the app open.
10. **Enhancement release is schema-only.** Money-locked ledger, contract P&L, document vault, bill readiness, gate reconciliation, bid pricing and the new dashboard visuals have tables in an unapplied migration and no screens. Settings is read-only plus mock adds.

### Biggest risks

| Risk | Why it matters |
|---|---|
| Shared prod/dev database with real users on it | A script, migration or test run can damage live data. The guard only matches the `DATABASE_URL` string. |
| No backup or restore | A bad migration or manual error is unrecoverable. |
| Mock saves reported as success | Loss of trust and of real site data the moment staff start entering it. |
| Data exposure in the page payload | Any logged-in user receives PAN and, with the flag on, payroll data. |
| Deploy-on-push with no CI | Broken or schema-mismatched code can reach the live site. |

---

## 2. Client requirements (docs/client-requirements.pdf)

Writes that truly reach the database today: **Tenders** (create, edit, delete, stage, GO/NO-GO, won/lost, conversion), **Approvals** (decide), **Projects** (via conversion; add/edit once the new code is deployed), **Subcontractor master** (add/edit once deployed). Everything else writes only to browser storage.

### Dashboard (13 items, /dashboard)

| Item | Status | Evidence | Notes |
|---|---|---|---|
| Active tenders | ✅ | `getActiveTenders`, dashboard13.ts; live: dashboard loads with data | Real data |
| Upcoming tender deadlines | 🟡 | `/tenders/deadlines` | Computed on read; no stored or sent reminders |
| Won / lost tenders | ✅ | `getWonLostTenders` | Real data |
| Active projects | ✅ | `getActiveProjects` | |
| Project value | ✅ | `getProjectValue` | |
| Subcontractor work | 🟡 | `getSubcontractorWork` | Reads work orders that cannot be created in the app |
| Subcontractor pending payments | 🟡 | `getSubcontractorPendingPayments` | Bills and payments cannot be entered |
| Employee count | 🎭 | `getEmployeeCount` | Employee add is browser-only |
| Salary pending | 🎭 | `getSalaryPending` | No payroll write |
| PF status | 🎭 | `getPfStatus` | |
| GST due / filed | 🎭 | `getGstDueFiledStatus` | No invoice write |
| Customer receivables | 🎭 | `getCustomerReceivables` | |
| Overall revenue / expenses | 🎭 | `getRevenueExpenses` | |

### Tender register

| Item | Status | Evidence | Notes |
|---|---|---|---|
| Tender ID, organisation, name, description, value, EMD amount, fee, submission and opening dates | ✅ | tenders/schema.ts; live: Add tender form opens with these fields | Save verified by integration test, not exercised live |
| Eligibility | 🟡 | service.ts sets `eligibility: ""` | Displayed but no input field |
| Documents | 🟡 | `DocumentChecklist` in tender detail | Read only; no status update, no upload |
| Status and workflow (New → Under Evaluation → Bid Preparing → Submitted → Won/Lost) | ✅ | moveStage, markWon/Lost, GO/NO-GO | Stages come from a table |
| Reminders for deadlines | 🟡 | deadlines page, bell | Computed only |

### Projects

| Item | Status | Evidence | Notes |
|---|---|---|---|
| Tender → project conversion with approval | ✅ | requestConversionAction, handler | Not yet proven end to end by Playwright |
| Client, work order, value, dates, site, manager, status | ✅ | schema + conversion | |
| Add / edit project | 🟡 | src/modules/projects (uncommitted) | Integration-tested; **not on the live site** (no Add project or Edit button seen live) |
| Progress | 🟡 | read-only `progressPct` | No write path |
| Billing, payment | 🎭 | project detail tab | Derived from invoices that cannot be entered |

### Subcontractors

| Item | Status | Evidence | Notes |
|---|---|---|---|
| Company, contact details | 🟡 | src/modules/subcontractors (uncommitted) | Not on the live site yet |
| Assigned project, work, contract value, start/end, progress | 🎭 | detail tab, read-only | No work-order action |
| Bill submitted/amount, paid amount/date, balance | 🎭 | Bills/Payments tables read-only | No bill or payment action |
| Documents | ❌ | none | |
| The client's ₹50 L, three-subcontractor example | 🎭 | seed only | Cannot be built through the UI |

### Employees, payroll, GST (all behind the finance/payroll flag, **on in production**)

| Item | Status | Evidence | Notes |
|---|---|---|---|
| Employee master, designation, department, joining date, salary, advance | 🎭 | employees/page.tsx uses `upsert` | Browser only |
| Attendance | 🎭 | attendance/mark | Browser only |
| Deductions, PF, ESI, net salary, payment status | 🎭 | modules/workforce/payroll.ts | Calculation code and tests exist; no payroll-run action |
| GSTIN, invoice number/date, customer, taxable value, CGST/SGST/IGST, total, payment status, filing status | 🎭 | invoice-form.tsx | Calculation tested; saves browser only |

---

## 3. Modules and workflows (action by action)

| Module | Create | Edit | Delete | Status change | Approve | Import/Export |
|---|---|---|---|---|---|---|
| Tenders | ✅ | ✅ | ✅ (reason) | ✅ stage, won, lost | ✅ GO/NO-GO, conversion | Import 🟡 (row by row, not atomic, no dry run); export ✅ client-side |
| Projects | 🟡 (uncommitted) / ✅ via conversion | 🟡 | ❌ | 🟡 via edit form | n/a | ❌ both |
| Subcontractors master | 🟡 (uncommitted) | 🟡 | ❌ | 🟡 | n/a | ❌ |
| Work orders, bills, payments | ❌ | ❌ | ❌ | ❌ | ❌ no approval handler | ❌ |
| Daily work | 🎭 | 🎭 | ❌ | 🎭 | ❌ | 🎭 |
| Employees / attendance / payroll | 🎭 | 🎭 | ❌ | ❌ no payroll run | ❌ | 🎭 |
| GST / finance | 🎭 | 🎭 | ❌ | 🎭 (record payment) | ❌ | 🎭 |
| Purchases / vendors | ❌ no route, no nav, no action | ❌ | ❌ | ❌ | ❌ | ❌ |
| Approvals | n/a | n/a | n/a | n/a | ✅ for 2 flows only; any other type fails with "no handler" | export ✅ |
| Settings | 🎭 add stage / service line / expense category | ❌ | ❌ | ❌ | n/a | export 🎭 |
| Notifications | ❌ none stored; bell is computed from tenders and approvals | | | | | |

---

## 4. Enhancement features

**Status update (2026-10-08, after the enhancement run).** The run's work is merged into `main` (merge `1ad6e2d`; not pushed to origin, not deployed). Migration `20261008100000_enhancement_release` is **not applied** to any database (`prisma migrate status` on the shared DB). The live site was last deployed before this merge, so none of these features exist live. Checked on disk: screens, server actions with audit, unit tests and e2e specs. Not yet run: the e2e specs and the live site (the shared DB is protected and the migration is unapplied). Typecheck, lint (0 errors), 370 unit tests pass.

| Item | Status | Evidence | Notes |
|---|---|---|---|
| Dashboard visuals (funnel, gauge, donut, treemap, heat strip, sparklines) | **Complete (unverified live)** | `components/dashboard/charts.tsx` has funnel, treemap, heat strip, pie, area, sparkline; money-locked tiles and drill-down wired | Needs a visual check at 360/768/1280 and `dashboard.spec.ts` run |
| Dynamic Settings | **Partial** | `modules/settings` (19 audited actions), 12-section UI, no store writes; stage colour, approval due days, feature toggles wired | Still hard-coded: health thresholds, ageing buckets, GST due day, code formats, retention/TDS defaults (see list below). Audit-log viewer and user admin page not confirmed |
| Money-locked ledger | **Complete (unverified live)** | `/money-locked`, `modules/money-locked` (service, actions, `calc.test.ts`), e2e spec | Reads existing tables; needs the migration only for toggles/colour |
| Contract P&L | **Complete (unverified live)** | `/contract-pnl`, project P&L tab, `calc.test.ts`, e2e spec | Depends on payroll/bill data that is still mock (see W2-G/F) |
| Document vault | **Partial** | `/documents`, service + 5 actions, status test, e2e spec | Metadata only: no file storage (W1-C), so no real upload yet; expiry block on submission to confirm |
| Bill readiness | **Complete (unverified live)** | `/bill-readiness/[projectId]`, service + actions, readiness test, e2e spec | Evidence file attach needs W1-C |
| Gate attendance reconciliation | **Partial** | `/gate-reconciliation`, service, `gate.test.ts`, e2e spec | Needs real attendance (W2-E) to reconcile against |
| Bid pricing | **Complete (unverified live)** | `/bid-pricing`, service + calc test, `payroll-rules` dated rates, e2e spec | |

### Hard-coded rules that remain (should be settings)

Project health thresholds 5%/15% (projects.ts:12); deadline reminder bands 7/3/1 and urgent at 2 days; stage `systemKey` strings (SUBMITTED, WON…) in logic; project status keys; default payment terms 30 days; receivables ageing buckets; GST default 18%, filing due on the 11th, default TDS deduction ids; PF/ESI/PT rates and ceilings (dated constants in `payroll-rules.ts`); approval due +2 days at 18:00; approval assignment by role key; dashboard variant chosen by role-key strings (`home.tsx`); weekly off = Sunday; code formats (`SPH-…`); retention 5%, TDS 2%, PBG 45-day window, EMD follow-up 30 days. Expense categories, service lines and roles are database rows, but nothing in the code is driven by them yet. No `role ===` checks were found outside the seed.

---

## 5. Roles and security

| Item | Status | Evidence | Notes |
|---|---|---|---|
| Roles built | 🟡 | 2 roles in DB (system_admin 73 grants, director 44) | go-live-plan lists 6 roles with ₹ thresholds; cut by the minimal-scope decision. Roles and grants are data, not code ✅ |
| Server-side check on every write | ✅ | `runAction` (zod, `assertCan`, one transaction, audit; fails if no audit row); no write path outside it except password flag | Verified by integration tests, including a forged Director call |
| Region/project scope | 🎭 | `scopeFilter` returns `{}` | Must be built before any regional role is added |
| Maker-checker | ✅ | approvals/service.ts `SELF_APPROVAL`, step assignment, version guard, reason on reject | Admin has no approve grant |
| Audit log on writes | ✅ | `writeAudit` in same transaction; append-only trigger | |
| Audit viewer | ❌ | no UI | `audit_log:VIEW` is granted but nothing reads it |
| Auth events audited (login, failed login, password) | ❌ | TODO at auth/actions.ts:98 | |
| Secrets in client bundle | ✅ | only anon key and flags are `NEXT_PUBLIC`; service-role key server-only and unused | |
| RLS | 🟡 | 83 of 83 public tables enabled, **no policies** | Prisma bypasses RLS, so app code is the only real control |
| Sensitive data protection (PAN, bank, salary) | ❌ | party PAN sent unmasked to every user; bank accounts kept off the client (✅); payroll in snapshot when flag on | Admin has payroll rights in the seed, against the plan |
| Whole snapshot in every page | ❌ | session-gate.tsx, server-db.ts | No per-role filtering |
| Security headers (CSP, frame, HSTS, nosniff) | ❌ | next.config.ts has none | |
| Login rate limiting | 🟡 | in-memory, trusts `x-forwarded-for` | Ineffective on serverless |
| Password policy | 🟡 | length 10 only; 2 directors still on first-login passwords | |
| Reset-link origin from request headers | 🟡 | auth/actions.ts `origin()` | Depends on Supabase redirect allow-list |
| Sign-out is a GET | 🟡 | auth/signout/route.ts | Forced logout via image tag (low) |
| DPDP basics (consent, retention, erasure, breach process, data inventory) | ❌ | none | Audit log holds personal data in before/after JSON |
| Feature flag fails open | 🟡 | features.ts: finance/payroll ON unless `APP_ENV=production` | Should fail closed |

---

## 6. Data and integrations

| Item | Status | Evidence | Notes |
|---|---|---|---|
| CSV export | ✅ | import-export.tsx | On-screen rows only |
| CSV import: tenders | 🟡 | tender-entry.tsx | Persists per row; partial on failure; no dry run |
| CSV import: employees, attendance, daily work, invoices | 🎭 | store `upsert` | Shows "imported N rows", nothing reaches the DB |
| CSV import: projects, subcontractors | ❌ | | Helpers exist unused |
| Excel (.xlsx) import/export | ❌ | no library | |
| PDF export / printable reports | ❌ | | |
| File storage (documents, photos) | 🟡 | `Document` table, 56 seed metadata rows | No upload, bucket or signed-URL code |
| Email, WhatsApp, SMS | ❌ | no provider code, no SMTP config | |
| Scheduled reminders / cron | ❌ | vercel.json has regions only; no route handlers at all | |
| Tally integration | ❌ | none | Roadmap only |
| Real vs demo data separation | ❌ | no `isDemo`, no clear script | Docs contradict (go-live says no demo in production; decision D10 says ship with demo) |
| GSTIN placeholders | 🟡 | 4 generated GSTINs with valid checksums | No screen to edit them |
| Onboarding path for real data | ❌ | | Tender CSV is the only bulk path |

Production DB counts (read-only SELECT): User 4, Tender 50 (about 10 are `E2E/…` test rows), Project 10, Subcontractor 12, SubcontractorBill 63, Employee 156, Invoice 51, Payslip 918, Document 56, Notification 83, AuditLog 241, GstRegistration 4, Organisation 9. Essentially all demo.

---

## 7. Infrastructure and operations

| Item | Status | Evidence | Notes |
|---|---|---|---|
| Separate prod and dev databases | ❌ | docs/progress.md guard section | One Supabase project; guard blocks reset/seed/e2e by `DATABASE_URL` string only, not `db:deploy`, raw SQL or the dashboard |
| Region | 🟡 | vercel.json `hnd1` (Tokyo) with Supabase ap-northeast-1 | Co-located, but the plan says Mumbai; about 120-180 ms per round trip for Indian users |
| Vercel plan | Unknown | team name suggests a personal (Hobby) team | Hobby limits commercial use; verify |
| Backups, PITR, tested restore | ❌ | none in scripts or docs as done | Supabase plan unknown |
| Error monitoring, structured logging, uptime/health endpoint | ❌ | only `console.error`; no `/api/health` | |
| Custom domain | 🟡 | vercel.app aliases only | Warning in docs: `tender-crm.vercel.app` belongs to someone else |
| SMTP for reset and invites | 🟡 | Supabase default mailer | Heavily rate-limited; no in-app invite or user admin |
| CI/CD | 🟡 | git remote exists; no `.github/`; no CI | Deploy-on-push is probable but unverified; nothing gates lint, tests or build |
| Staging / preview | ❌ | single env set | Previews would likely hit the production DB |
| Secrets handling | 🟡 | `.env.local` git-ignored but inside a OneDrive-synced folder and holds production keys | No rotation process |
| Migrations | 🟡 | manual `db:deploy` from a laptop; no rollback process | Pending enhancement migration must be applied before code that depends on it is deployed |

---

## 8. Quality

| Item | Status | Evidence | Notes |
|---|---|---|---|
| Money logic tests (paise, GST split, invoice build, payroll, EPF/ESI/PT) | ✅ | lib/__tests__, workforce tests | Covers client-side code that is flagged off |
| Retention, TDS on bills, outstanding aggregates | 🟡 | partial | No dedicated assertions found |
| EMD / PBG lifecycle, subcontractor bill deductions | ❌ | unbuilt, untested | On the CLAUDE.md mandatory list |
| Permission and conversion integration tests | ✅ | approvals-audit, tenders-flow (9 tests), projects-subcontractors (5) | |
| Playwright | 🟡 | 6 specs; 14 passed, 4 failed in last recorded run | Won, convert and project steps never ran; no 768 or 1440 viewport; docs/bug-log and test-report disagree |
| Mobile (360/768/1280) | 🟡 | live: no horizontal overflow at 360 on 6 pages | Desktop tables are clipped (not scrollable) at 768 on wide lists such as tenders; no visual check of charts |
| Accessibility | ✅ / 🟡 | contrast script, focus rings, 44px targets, labelled inputs | Contrast not run today; skip link unverified; row click has no keyboard role |
| Loading, empty, error states | 🟡 | one shared loading/error page; EmptyState widely used | No per-route boundaries |
| Performance | 🟡 | live: every page 4-7 s to network idle (measured remotely); sign-in 6-8 s | 1 MB payload; client builds the whole demo seed at import (`buildSeedDatabase()`) |
| Code quality | ✅ | 0 `any`/`ts-ignore`; one TODO | Dead code: unlinked reset pages, in-memory limiter, demo store, styleguide; duplicated client-side `buildX` vs server services |

---

## 9. Field and mobile

| Item | Status | Evidence | Notes |
|---|---|---|---|
| PWA manifest, service worker, install icons | ❌ | no manifest, no sw.js | `proxy.ts` already excludes them |
| Offline and local drafts | ❌ | form state in `useState` only | A lost signal loses the report |
| Daily report entry | 🎭 | daily-work/new → store `upsert` | Equipment dropped; planned quantity set equal to actual |
| Mobile attendance | 🎭 | attendance/mark | Browser only |
| Photo capture | 🟡 | camera input works | Only the count is kept |
| Photo compression and upload | ❌ | none | |
| Bottom nav, sticky bar, touch targets | ✅ | components/layout | Site layout exists only in demo personas; real DB has no site roles |
| Site roles (supervisor, engineer) in DB | ❌ | 2 roles only | |
| Languages (Hindi, Tamil, Marathi) | ❌ | `lang="en"`, no i18n | |

---

## 10. Live site check (https://sprince-crm.vercel.app, both roles, nothing saved)

- Logins worked for both roles. All 20 pages checked returned 200 for both roles, with **no console errors, no failed requests, no 404 nav links, and no horizontal overflow at 360 px** (dashboard, tenders, projects, subcontractors, daily-work/new, employees).
- Both roles see the same nine nav items. Pages show data (tenders 40 rows, projects 10, subcontractors 12, employees 30).
- Admin: Add tender form opens with the expected fields and cancels cleanly.
- Director: no Add tender or Edit buttons (correct).
- **Add project, Add subcontractor and the Edit buttons are not on the live site**: the code is uncommitted.
- Load times 4-7 s per page; the slowest were payroll, attendance and the deadlines page (about 7 s).
- Pages not exercised: any save, server-side validation, Import CSV dialogs.

---

## 11. Bugs found

| # | Severity | Bug | Steps / location |
|---|---|---|---|
| B1 | **High** | Success toast but nothing saved: Daily report, Attendance, Employee add, Invoice create/payment, Settings add (stage, service line, expense category) | Sign in, open the form, submit. Writes via `useDataStore.upsert`, src/store/data-store.ts. Settings: settings-view.tsx lines 101-124 (the page reads the server snapshot, so the new row never even appears) |
| B2 | **High** | Director sees admin-only write controls on Employees, Finance, Daily Work, Settings (Add employee, New invoice, New report, Mark attendance, Import CSV, Record payment, Add tender stage). Whether the server refuses them was not tested | Log in as Director, open those pages. Cause: `useTenderRoles` gating exists only on tender, project and subcontractor screens |
| B3 | High | Tender flow end to end (Won, convert, project visible) is not verified by Playwright; "Mark won" button stayed disabled in the last run, suspected snapshot cache after stage change | docs/test-report.md |
| B4 | High | Test rows (`E2E/…` tenders) sit in the production database | SELECT on Tender |
| B5 | Medium | Console error TF-9 "useInsertionEffect" on /tenders/[id]: listed open in the bug log; live crawl saw no console error, so likely fixed. Status needs confirming | docs/bug-log.md |
| B6 | Medium | Daily report: equipment never saved; planned quantity = completed quantity; no duplicate-report check | daily-work/new/page.tsx:73 |
| B7 | Medium | Tender CSV import is row by row: a failure midway leaves a partial import; one round trip per row | tender-entry.tsx |
| B8 | Medium | Approvals for any type other than the two tender flows fail with "no handler registered" if they ever arrive | register-handlers.ts |
| B9 | Medium | Desktop tables use `overflow-hidden`: wide lists clip at 768 px | shared/data-table.tsx |
| B10 | Medium | Pages take 4-7 s; sign-in 6-8 s with no progress feedback | live site |
| B11 | Low | Eligibility cannot be entered on a tender | tenders/service.ts:118 |
| B12 | Low | Notification rows are created on approval but nothing reads them | approvals/service.ts |
| B13 | Low | Docs disagree: progress.md stage table stale; bug-log vs test-report; go-live vs decision D10 | docs/ |
| B14 | Low | `/auth/signout` is a GET | auth/signout/route.ts |

The data agent reported that daily-work tables are missing from the database; that was not confirmed (it queried table names that may not match the Prisma model names), so it is not listed as a bug.

---

## 12. Prioritised gap list

Effort: S = under 2 days, M = 2-5 days, L = over 5 days.

### P0: safety, blocking for real use

| # | Item | Effort |
|---|---|---|
| 1 | Stop silent loss: hide or disable every store-only form and import (daily work, attendance, employees, invoices, settings adds) until wired, or turn the finance/payroll flag off in production and make the flag fail closed | S |
| 2 | Separate production from dev/test: second Supabase project (Mumbai), separate env and keys, Vercel preview env pointing at the dev project | M |
| 3 | Clean demo and test data from production and add `isDemo` plus a guarded clear script, or start production with a fresh database | M |
| 4 | Backups with a tested restore (daily dump or PITR on a paid plan) | S |
| 5 | CI (lint, typecheck, unit tests, build) gating merges, and a documented migrate-before-deploy step | S |
| 6 | Hide admin-only buttons from the Director everywhere and confirm the server refuses those writes | S |
| 7 | Security headers; durable rate limit (Supabase limits or Upstash); stop sending PAN and payroll to every client; remove Admin payroll grant if the plan stands | M |
| 8 | Error monitoring, uptime check and `/api/health` | S |
| 9 | Deploy the projects/subcontractors forms and verify them live; apply the pending migration only with owner approval | S |

### P1: needed for daily work

| # | Item | Effort |
|---|---|---|
| 10 | Server actions plus audit for **daily reports** and **attendance** (mobile first), with local drafts | L |
| 11 | Subcontractor **work orders, bills, deductions, payments** with approval handlers, plus tests for deductions and outstanding | L |
| 12 | **Employees and payroll run** with approval, EPF/ESI export | L |
| 13 | **GST invoices, receipts, deductions** server-backed; editable GSTIN master | L |
| 14 | **Document storage** (Supabase Storage): tender checklist, project and subcontractor documents, photos with compression | M |
| 15 | **Scheduled reminders** (cron route) plus email delivery with custom SMTP | M |
| 16 | Real settings: make stage, service line, expense, threshold, reminder and statutory-rate settings drive behaviour, with audit; remove hard-coded rules | L |
| 17 | User admin screen and invites; site roles (supervisor, engineer) with region/project scope and the planned approval thresholds | L |
| 18 | PWA (manifest, service worker, icons) and offline drafts | M |
| 19 | Audit-log viewer and audit of login events | M |
| 20 | Import with dry run and error report for projects, subcontractors, tenders | M |
| 21 | Per-page data loading instead of the whole-database snapshot; remove client seed build | L |
| 22 | EMD / PBG lifecycle and EMD refund tracking; tender eligibility field; bid and L1 entry | M |
| 23 | Playwright green run for tender to project, plus desktop/768/mobile coverage for the new screens | M |

### P2: nice to have

Enhancement features (money-locked ledger M, contract P&L M, bill readiness M, document vault M, gate reconciliation L, bid pricing M, new dashboard visuals M); Excel and PDF export (M); Tally export (L); WhatsApp (M); Hindi/Tamil/Marathi (L); DPDP programme (policy, retention, erasure, breach process; M); per-route loading/error boundaries (S); custom domain (S); purchases and vendors module (L).

### Suggested build order and parallel agents

| Wave | Work (agents can run in parallel within a wave) |
|---|---|
| 0, one person, first | Items 1, 2, 3, 4, 5, 9 (safety and environment). Nothing else should write to the shared database until 2 is done. |
| 1, parallel | A: item 6 + 7 (permissions, headers, data exposure) · B: item 8 + 19 (monitoring, audit viewer) · C: item 14 (storage) · D: item 16 (settings backend) |
| 2, parallel, one module per agent | E: daily reports + attendance + PWA/offline (10, 18) · F: subcontractor work orders, bills, payments (11) · G: employees + payroll (12) · H: GST invoices (13) · I: reminders and email (15) |
| 3 | User admin and roles with scope (17); then performance work (21); tender extras (22); import (20) |
| 4 | Enhancement features (P2), each an independent agent once Settings (16) and storage (14) exist |

Dependencies: 2 before any module write work; 16 before enhancement features; 17 before any regional role; 14 before bill readiness and document vault.

---

## 13. Questions for S. Prince that block further building

1. **Go-live scope:** should Employees/Payroll and GST/Finance be live on day one? The brief lists them as core; the plan deferred them.
2. **Roles:** is a two-role system (admin, director) acceptable, or do you need regional heads, project managers, accounts, HR and site supervisors, and with which approval limits (the plan assumed ₹1 crore for tenders and ₹10 lakh for bills and work orders)?
3. **Real data:** will you start with a clean database, or keep the demo data for training? Who supplies the real tenders, employees, subcontractors and GSTINs, and in what format?
4. **GSTINs:** please provide the real GSTIN for each state office.
5. **Eligibility:** free text, or structured criteria (turnover, experience)?
6. **Tender ID:** the department's number, an internal number, or both?
7. **Reminders:** how many days before a deadline, over which channel (in-app, email, WhatsApp), and to whom?
8. **Subcontractor bills:** is "bill submitted" a flag or a bill with approval? Many subcontractors per project and many projects per subcontractor, with separate work orders each time? Which subcontractor documents are mandatory?
9. **Billing and payment on projects:** do you mean running-account bills, GST invoices, or milestones?
10. **Payroll rules:** confirm PF 12% with the ₹15,000 ceiling, ESI 0.75%/3.25% up to ₹21,000, professional tax by state; are office staff and site labour in one master?
11. **GST:** a single 18% rate? Which returns to track (GSTR-1, 3B) and due dates? Which GSTIN applies to plants in states with no registration?
12. **Hosting and compliance:** is a Mumbai-hosted database required? Is a paid plan (backups, point-in-time restore) approved? Which domain should be used, and which mailbox sends system email?
13. **Languages and devices:** do site staff need Hindi, Tamil or Marathi, and are they on low-end phones with poor signal (decides offline scope)?
14. **Integrations:** is Tally integration or WhatsApp needed for go-live?
15. **Data protection:** who is the person responsible for personal data (DPDP), what retention periods apply to employee data, and who may see salary and PAN?
