# Audit report: S. Prince Management Tool (v2)

Audit date: 2026-10-07 (the app's fixed demo "today"). Read-only: no application code was changed. This file replaces the earlier audit, which is preserved as `docs/audit-report-v1.md`.

**Method.** Five parallel read-only Explore agents (client coverage, research P0 items, research P1/P2 and billing, technical readiness, bugs and money logic). I ran lint, typecheck, build, `seed:check` and `contrast:check` myself and spot-checked the three most consequential findings (EPF ceiling, "UNREGISTERED" customer GSTIN, 360px header widths). Everything else is from reading code. **Nothing was run in a browser**, so layout, console errors and runtime behaviour are not verified.

**Source caveats.**
- `docs/client-requirements.pdf` **does not exist**. Section 2 is measured against `docs/client-profile.md`, CLAUDE.md, `docs/system-flow.md` and the field lists in `scripts/check-seed.ts`. If the real PDF asks for more, this report understates the gap.
- The research report is at the repo root (`research-report.md`), not `docs/`. `Government contractor operations and CRM market.md` is a byte-identical duplicate.
- Several research-report facts are dated 2026 and come from web sources I did not re-verify (EPF ceiling Rs 25,000 from 17-Sep-2026, GST 18% on government works, s.393 TDS, BOCW cess, TReDS). The report itself flags the ESIC due date and Chhattisgarh Labour Code status as unconfirmed. Treat them as inputs to confirm with S. Prince's CA, not as settled law.

**Status key.** ✅ Done (working code, user can create/change the data) · 🟡 Partial · 🎭 UI only, mock data (displays seeded data; nothing can change it) · ❌ Missing. "Done" here means "works against the in-browser store"; there is no backend, so nothing is production-grade.

---

## 0. Check results

| Check | Result |
|---|---|
| `npm run lint` | Pass, 0 problems |
| `npm run typecheck` | Pass |
| `npm run build` | Pass (Next 16.4.0 Turbopack, 500 static pages generated in 12.4s). **Warning:** Recharts logs `The width(-1) and height(-1) of chart should be greater than 0` four times during static generation, meaning at least some chart containers render with no size at prerender (likely harmless at runtime, but not verified) |
| `npm run seed:check` | Pass, "all checks passed" (integrity, client fields, 13 dashboard items populated) |
| `npm run contrast:check` | Pass, all 24 token pairs meet AA (text ≥ 4.5, indicators ≥ 3). Accent yellow on white is 1.81:1, documented as fill-only |
| `npm test` / `npm run test:e2e` | **Do not exist.** No test script, runner, or `*.test.*`/`*.spec.*` file |
| Browser checks (console, 360/768/1280px) | **Not run** |

---

## 1. Inventory

### 1.1 Stack actually installed

| Layer | Installed | CLAUDE.md says | Gap |
|---|---|---|---|
| Framework | Next.js 16.4.0 (App Router, `cacheComponents`, partial prefetching), React/ReactDOM 19.3.0 | Next.js | none |
| Language | TypeScript 5.9.3 | strict | typecheck passes |
| Styling/UI | Tailwind 4.3.3, `@base-ui/react` 1.8.0, shadcn CLI 4.21.3, lucide-react 1.52.0, sonner, tw-animate-css, class-variance-authority | Tailwind + shadcn | `shadcn` is a runtime dependency; `cn` is the npm package `cn` and `tailwind-merge` is not installed |
| Charts | Recharts 3.8.0 | Recharts | none |
| State | Zustand 5.0.15 + localStorage overlay | n/a | stand-in for a backend |
| Lint | ESLint 9.39.5 + eslint-config-next | | |
| Database / ORM | none | PostgreSQL + Prisma | ❌ |
| Auth | none | Auth.js | ❌ |
| Validation | hand-written in `src/modules/*/entry.ts` | Zod everywhere | ❌ |
| Storage, jobs, tests, PWA | none | S3, scheduler, Vitest, Playwright, PWA | ❌ |
| Script runner | `tsx` fetched via `npx --yes` each run, not a devDependency | | minor |

### 1.2 Routes

| Route | Description |
|---|---|
| `/` | Redirects to the signed-in persona's home path |
| `/dashboard` | Role-aware home. Director view = command centre, 13 client KPIs, attention items, charts |
| `/home` | Duplicate of dashboard, unreferenced |
| `/approvals` | Approvals inbox: tabs, approve/reject with comment, new request |
| `/tenders` | Register with stage chips, search, charts, add form, CSV import/export |
| `/tenders/deadlines` | Open tenders in 1/3/7-day and overdue bands |
| `/tenders/[id]` | Detail: stage stepper, timeline, EMD/instruments, bid, award, checklist, convert to project |
| `/projects`, `/projects/[id]` | List/add/CSV; detail tabs Overview, Progress (BOQ), Subcontractors, Billing, Daily reports |
| `/subcontractors`, `/subcontractors/[id]` | Master/add/CSV/assign to project; detail with work orders, bills, payments, documents |
| `/employees`, `/employees/[id]` | Directory/add/CSV; profile, assignments, attendance, payslips |
| `/employees/attendance`, `/employees/attendance/mark` | Monthly grid + CSV import; mobile marking screen |
| `/employees/payroll`, `/employees/payroll/dashboard` | Payslips by month; salary and PF charts |
| `/finance`, `/finance/invoices/[id]` | Invoices / GST summary / Receivables / revenue; invoice detail with record-payment |
| `/daily-work`, `/daily-work/new`, `/daily-work/[id]` | Reports, manpower chart, missing reports, issues; mobile-first entry; detail and review |
| `/settings` | Add tender stages, service lines, expense categories; roles/regions read-only; demo reset |
| `/styleguide` | Component showcase, not in nav |

Dynamic routes have `generateStaticParams` (seed ids only). There is **no** `loading.tsx`, `error.tsx`, `not-found.tsx`, `global-error.tsx`, route handler, server action or middleware. `/notifications` was removed in the working tree; notifications are now a header bell menu, and nothing links to the old route.

### 1.3 Shared components

- `components/shared`: DataTable (sort, search, show-more, skeleton, card mode below `md`), EmptyState, KpiTile (sparkline), StatusBadge/DeadlineBadge, Timeline.
- `components/charts/chart-card.tsx`: ChartCard (title, unit, empty state, legend).
- `components/layout`: app-shell (skip link, access guard), sidebar, mobile drawer, bottom nav (site roles), header, page header, region filter, as-of date filter, role switcher, brand.
- `components/data`: ImportExport (CSV), RecordForm (generic side sheet).
- `components/ui`: shadcn primitives on base-ui. `badge`, `card`, `separator`, `table` and `layout/module-placeholder.tsx` have no importer.
- Feature folders: approvals, dashboard, finance, notifications, settings, tenders, work, workforce.

### 1.4 How data is stored and loaded

- A deterministic seed is rebuilt on every load (`src/lib/data/seed/*`, `buildSeedDatabase`): 40 tenders, 10 projects, 156 employees, 51 invoices, ~200 daily reports, ~11.9k attendance rows, ~900 payslips, 106 approvals, 12 subcontractors. The schema is the TypeScript `Database` interface in `src/types/database.ts` (about 70 entity arrays).
- `src/store/data-store.ts` keeps an overlay `{upserts, removed}` in localStorage (`sprince-tool:data`); session (user, region, as-of date) in `sprince-tool:session`. A `SEED_VERSION` bump discards user edits. `remove()` is a hard delete.
- Reads: pure functions in `src/lib/data/*` and `src/modules/*`. Writes: `upsert()` from screens and `modules/*/entry.ts` builders. IDs are client-generated (`Date.now()`/`Math.random()`).
- The whole dataset, including salaries and PAN, ships in the browser bundle.
- The demo clock is fixed (`DEMO_TODAY = 2026-10-07`) with an as-of override in the header.

### 1.5 Scripts

`dev`, `build`, `start`, `lint`, `typecheck`, `contrast:check`, `seed:check`. CLAUDE.md also lists `test`, `test:e2e` and Prisma commands, none of which exist.

---

## 2. Client requirements coverage

Requirement source: see caveat above. "Can the UI change it?" is the test for ✅.

### 2.1 Dashboard, the client's 13 items (`lib/data/dashboard13.ts`, `components/dashboard/kpi-grid.tsx`)

| # | Requirement | Route/file | Status | Notes |
|---|---|---|---|---|
| 1 | Active Tenders | `/dashboard`, `kpi-grid.tsx`, `tenders/tender-charts.tsx` | ✅ | Count, value, funnel. Moves when a tender is added. Chart drill-down `?stage=` is not read by the tender list |
| 2 | Upcoming Deadlines | `/dashboard`, `/tenders/deadlines` | ✅ | 7-day count, urgent, missing docs. Urgent threshold differs across screens (bug T3) |
| 3 | Won / Lost | `/dashboard` | 🎭 | Win rate/values shown, but no tender can be moved to Won/Lost in the UI, so figures never change |
| 4 | Active Projects | `/dashboard` | 🟡 | RAG health and progress computed live, but progress comes from BOQ executed quantity which nothing updates (see 2.3) |
| 5 | Project Value | `/dashboard` | ✅ | Contract, billed (taxable), to-bill. Updates on new projects/invoices |
| 6 | Subcontractor Work | `/dashboard` | ✅ | New assignments appear |
| 7 | Subcontractor Pending Payments | `/dashboard` | 🎭 | Bills and payments cannot be created, so static. Overdue uses hard-coded 30 days |
| 8 | Employee Count | `/dashboard` | ✅ | Updates when an employee is added |
| 9 | Salary Pending | `/dashboard`, `/employees/payroll/dashboard` | 🎭 | Latest-month seeded payslips; status can't be changed |
| 10 | PF Status | same | 🎭 | "Remitted" is a proxy for payroll run LOCKED; no challan record |
| 11 | GST Due / Filed | `/dashboard`, `/finance?view=gst` | 🎭 | Counted per invoice, not per return period; filing status can't change, so filed count is frozen |
| 12 | Customer Receivables | `/dashboard`, `/finance?view=receivables` | ✅ | Updates on new invoice and record-payment. Ageing definition differs from Finance screen (B9) |
| 13 | Revenue / Expenses | `finance/revenue-chart.tsx` | 🎭 | Expenses not entered anywhere; revenue is taxable invoiced value, not cash |

### 2.2 Tender

| Requirement | Route/file | Status | Notes |
|---|---|---|---|
| Register tender (no, title, organisation, service line, region, location, value, EMD, fee, submission, opening, type, owner, work description) | `tenders/tender-entry.tsx`, `modules/tenders/entry.ts` | ✅ | |
| Eligibility, plant site, portal, source URL, published/pre-bid/technical/financial dates, bidding GSTIN | same | ❌ on entry | Not on the form or CSV; saved empty. Detail shows them only for seeded rows |
| Edit tender | none | ❌ | Create-only |
| CSV import/export | `components/data/import-export.tsx` | ✅ | |
| List, stage chips, search, filters | `tenders/tender-list.tsx` | ✅ | Reads `status`, `result` only |
| Detail (all fields) | `/tenders/[id]` | ✅ view | |
| Stages New → Under Evaluation → Bid Preparing → Submitted → Won/Lost | stepper + timeline in `tender-detail.tsx` | 🎭 | **No action moves a tender between stages.** A user-registered tender can never be won, lost or converted |
| Stage configuration | `/settings` | 🟡 | Add only; no rename/reorder/deactivate; stages carry no behaviour |
| GO / NO-GO | `tender-detail.tsx` | 🎭 | Displays seeded decisions. Approving the request writes no decision and moves no stage; no NO-GO reason input |
| Document checklist | `DocumentChecklist` | 🎭 | Read-only. New tenders get none, and the screen says it is created at Bid Preparing, which is unreachable |
| EMD amount and fee | form | ✅ | |
| EMD instruments (mode, bank, dates, status) | detail | 🎭 | Display only. A UI-created tender's EMD never becomes an instrument, so "EMD locked" omits it (T1) |
| Bid, L1, competitors, clarifications, award (LoA, agreement, conditions) | `BidSection`, `AwardSection` | 🎭 | Display only |
| Reminders 7/3/1 | `deadline-list.tsx`, `lib/data/tenders.ts reminderBand` | 🟡 | Banding is live and real; nothing is generated, scheduled or sent; periods hard-coded |
| Tender → project conversion | `tenders/convert-to-project.tsx`, `buildConversion` | 🟡 | Real code with award-condition gate and override reason; carries organisation, region, GSTIN, value, dates, PBG. Only reachable for seeded Won tenders. Sets manager null, creates no BOQ, copies no documents |

### 2.3 Project

| Requirement | Route/file | Status | Notes |
|---|---|---|---|
| Create (name, code, customer, plant site, service line, contract type, billing cycle, work order no/date, payment terms, value, dates, GSTIN, status, manager) | `app/projects/page.tsx`, `modules/projects/entry.ts` | ✅ | CSV too |
| List with progress, planned marker, health | `projects/page.tsx` | ✅ | |
| Detail: Overview, Progress, Subcontractors, Billing, Daily reports | `projects/[id]/detail.tsx` | ✅ view | |
| Edit / delete / change status | none | ❌ | |
| BOQ | Progress tab | 🎭 | No editor/import. New and converted projects have an empty BOQ |
| Progress and health | `lib/data/projects.ts` | 🟡 | A daily report never updates BOQ `executedQty`, so progress is frozen. An empty BOQ gives 0% so new projects turn Amber then Red (T5). `healthOverride` has no UI |
| Planned vs actual | detail | 🎭 | Seeded monthly snapshots |
| Billing tab | detail | ✅ | Derived from invoices |
| Team, budget vs actual, documents, sites | none | ❌ | `getBudgetVsActual` exists but no screen calls it |

### 2.4 Subcontractor

| Requirement | Route/file | Status | Notes |
|---|---|---|---|
| Master (name, contact, phone, email, GSTIN, PAN, address, state, trade, status) | `modules/subcontractors/entry.ts` | ✅ | PAN and GSTIN format validated |
| Bank details | none | ❌ | In system-flow, absent from the model |
| Edit / deactivate | none | ❌ | |
| Many projects per subcontractor, per-project assignment | "Assign to project" | ✅ | Blacklist check. Progress fixed at 0 and cannot be updated |
| Bills, deductions, approval | detail | 🎭 | Display only. A generic approval request exists but is not linked to a bill |
| Payments / balance / last payment | detail | 🎭 | History only; no record-payment screen |
| Documents | detail | 🎭 | Seeded file names; no upload |
| Dashboard | `/subcontractors` | 🟡 | KPI tiles, overdue filter; by-trade breakdowns computed but not rendered |

### 2.5 Employees and payroll

| Requirement | Route/file | Status | Notes |
|---|---|---|---|
| Add employee (code, name, phone, site, designation, department, joining, wage, advance, PF/ESI flags, UAN) | `modules/workforce/entry.ts` | ✅ | ESI flag not derived from wage |
| Edit / transfer between sites | none | ❌ | |
| Directory, detail, filters | `/employees` | ✅ view | |
| Mark attendance | `/employees/attendance/mark` | ✅ | Present/half/absent/leave only; no OT, shifts, offline |
| Attendance grid + CSV import | `/employees/attendance` | ✅ | |
| Payslip (days, gross, advance, PF, ESI, deductions, net, status) | `/employees/payroll` | 🎭 | Computed only inside the seed script. No screen creates, approves or marks a payslip paid or on hold |
| Payroll runs | none | ❌ | |
| PF/ESI | payroll dashboard, `pf-banner.tsx` | 🎭 | Seeded numbers; no calculation at runtime, no remittance record, no ECR/ESIC file |

### 2.6 GST and invoices

| Requirement | Route/file | Status | Notes |
|---|---|---|---|
| Create invoice (GSTIN, customer, project, number, date, type, period, taxable, GST %, deductions) | `finance/invoice-form.tsx`, `modules/finance/entry.ts` | ✅ with defects | CGST+SGST vs IGST derived from plant-site state; filing due 11th; payment due from project terms. Defects: B1, B4–B7, B18, G1–G3 |
| Invoice detail, deductions, receipts | `/finance/invoices/[id]` | ✅ | |
| Record payment | invoice-detail.tsx | ✅ | Rejects over-payment; date forced to today, mode forced to bank transfer, no UTR |
| Mark GST filed / filing reference | none | ❌ | |
| GST summary per GSTIN/month | `finance/gst-summary.tsx` | 🟡 | Net GST computed in `lib/data/gst.ts` is not rendered |
| Receivables ageing | `finance/receivables.tsx` | ✅ | |
| Edit/cancel invoice, credit notes, ITC | none | ❌ | |

### 2.7 Other modules (system-flow and CLAUDE.md scope)

| Requirement | Route/file | Status | Notes |
|---|---|---|---|
| Daily report entry (BOQ items, workers, equipment, issues, photos, plan) | `/daily-work/new` | 🟡 | Equipment and photo files not saved (count only); planned qty forced equal to completed; does not update BOQ or progress; no offline draft |
| Report review, site issues, dashboard | `/daily-work` | ✅ / 🟡 | Issues can be raised but not closed |
| Site requests, purchases, vendors, stock | none | ❌ | Types and seed only |
| Approvals inbox | `/approvals` | 🟡 | Single step; approving never changes the source record; no thresholds, no self-approval guard, no delegation |
| Notifications | bell menu | 🟡 | Read/unread and deep links; all rows seeded, nothing generates them; no full list page now |
| Settings | `/settings` | 🟡 | Three add-only lists. Not configurable: checklists, reminder periods, deduction types, project statuses, health rules, approval levels, payroll rules, GSTINs, roles |
| Roles and permissions | `lib/data/access.ts` | 🟡 | Data-driven, but UI-only; see section 5 |
| Audit trail | `types/audit.ts`, `listAuditLogs` | 🎭 | Nothing writes an entry and no screen shows the log |

**Most important functional gaps against the client brief:** tender stages cannot be driven; no payroll run; GST filing cannot be marked; subcontractor bills and payments cannot be entered; daily reports do not move project progress; no edit screens anywhere; approvals do not act on records.

---

## 3. Research checklist coverage

Status uses the same key. "MVP status" in the research report is its guess; this column is what the code shows.

### 3.1 P0, go-live blockers

| # | Capability | Status | Evidence | Gap |
|---|---|---|---|---|
| 1 | Contract (work order) master | 🟡 | `types/project.ts`, `types/site.ts`, `modules/projects/entry.ts` | Has work order no/date, organisation, plant site, region, our billing GSTIN, contract type, billing cycle, payment terms, value, dates. Missing: client unit GSTIN, central/state jurisdiction, tax basis, escalation type (firm/statutory/PVC), deployment norms, LD/penalty, PBG/SD/retention terms on the contract (retention is a hard-coded 5% deduction type), DLP, subletting, CPSE flag, Udyam link, licence link |
| 2 | Expanded tender state machine | 🟡 | `lib/data/seed/masters.ts`, `types/tender.ts` | 6 stages; GO/NO-GO, bid technical result, L1 rank, clarifications, stage history exist as data. Missing: TC opened, PB opened/eRA, negotiation/counter-offer/MSE match, validity extension, Cancelled, Retendered link, representation timer, rejection/loss reason codes. Stages carry no behaviour and cannot be advanced in the UI |
| 3 | Multi-milestone dates, corrigendum versioning | 🟡 | `types/tender.ts` | Pre-bid, submission, technical and financial opening dates exist in the type (not on the form). No query deadline, physical-submission date, bid validity, corrigendum entity, date-change history or recalculation |
| 4 | Document vault with validity-on-date gating | 🎭 | `types/platform.ts`, `TenderDocumentItem` | Document metadata with fake storage key; per-tender checklist status. No issue/expiry on `Document`, no valid-on-date check, no 60/30/7 alerts, no DSC register |
| 5 | LoA intake → task chain → contract | 🟡 | `convert-to-project.tsx`, `TenderAward`, `AwardCondition` | Conversion with condition gate works for seeded tenders. No dated task chain, PBG calculator, Shram Suvidha task, mobilisation gate |
| 6 | Financial-instrument ledger | 🟡 | `SecurityInstrument`, `SecurityInstrumentEvent`, `RetentionEntry`, `lib/data/tenders.ts` | EMD/PBG/ABG/SD instruments with events; PBG-expiry and EMD-follow-up alerts on dashboard. No create/extend/release UI (only conversion writes), no claim expiry, margin, commission, bank-wise limits, validity calculator. Instruments require `tenderId`; retention release unused in UI |
| 7 | Versioned statutory rules engine | ❌ | `seed/payroll.ts:12-17`, `seed/workforce.ts:44`, `modules/finance/entry.ts:79` | Every rate is a literal. **EPF ceiling is Rs 15,000 (stale vs Rs 25,000 from 17-Sep-2026)**. No effective dating, jurisdiction wage master, source documents or arrears |
| 8 | Contract-labour payroll engine | 🎭 | `seed/payroll.ts`, `app/employees/payroll/*` | Payslips are generated by the seed script only. No runtime engine, ECR/ESIC/bank files, bounce handling, 7-day countdown, advance ledger, F&F, OT at 2x |
| 9 | Worker onboarding and expiry pipeline | ❌ | `types/workforce.ts` EmployeeProfile | Name, wage, flags, UAN only. No KYC, bank/IFSC, police verification, medical, induction, gate pass, expiry calendar, appointment letters |
| 10 | Monthly bill-readiness checklist | ❌ | none | No type, no gate on "submitted" |
| 11 | Bill lifecycle mirroring PSU stages | ❌ | `types/accounts.ts` | Payment status is UNPAID/PARTLY_PAID/PAID only. No diary number, stage history, insufficiency log, days-in-stage, unbilled report |
| 12 | Draft vs tax invoice, IRN, tax type, series | 🟡 | `modules/finance/entry.ts`, `invoice-form.tsx` | Tax type derived from place of supply; unique number per GSTIN. No draft/tax-invoice split, IRN, 30-day rule; series does not reset per FY; GST rate free input |
| 13 | Receipt allocation to deductions | 🟡 | `InvoiceDeduction`, `Payment` | Expected deductions per invoice by type; a receipt links to one invoice. No allocation by deduction, no dispute item, no expected-vs-credited TDS |
| 14 | Subcontractor compliance gate | 🟡 | `types/parties.ts`, `modules/subcontractors/entry.ts` | PAN/GSTIN, trade, blacklist, work orders with retention %, bills with deductions. No filing status, Udyam, licence validity, PF/ESI proof, payment hold |
| 15 | RBAC with scopes, maker-checker | 🟡 / 🎭 | `lib/data/access.ts`, `types/access.ts`, `approvals-inbox.tsx` | Roles/permissions as data and `can()`/`canView()` hide screens, but "NOT security" (by its own header). Region filter only; project/site scopes never applied; most write actions unchecked; single-step approval; no self-approval guard |
| 16 | Immutable audit trail | 🎭 | `types/audit.ts`, `seed/platform.ts` | Type and seeded rows only. No runtime writes, no viewer, `remove()` hard-deletes, edits overwrite |
| 17 | Multi-entity / multi-GSTIN | 🟡 | `types/org.ts`, `lib/data/gst.ts`, `finance/gst-summary.tsx` | GSTIN master, region mapping, per-GSTIN GST summary and invoice numbering. No legal-entity layer, no compliance calendar, form lets any GSTIN be chosen regardless of project/site (B6, G1) |
| 18 | Bulk import/export and Tally | 🟡 | `lib/csv.ts`, `components/data/import-export.tsx` | CSV import/export for 6 entities. No .xlsx, no Tally, no statutory file formats |

### 3.2 P1

| # | Capability | Status | Evidence | Gap |
|---|---|---|---|---|
| 19 | PSU gate/CLIMS import and three-way reconciliation | ❌ | `Attendance.source` enum has IMPORT/BIOMETRIC, unused | No gate-log entity or comparison; DPR `workersCount` is typed in and never compared with attendance |
| 20 | Offline mobile supervisor app | 🟡 | `daily-work/new`, `bottom-nav.tsx`, `attendance/mark` | Mobile-first DPR and attendance exist. No PWA, offline queue, gang mode, geofence, Hindi/Marathi, photo upload (count only) |
| 21 | Shift roster and fill-rate, OT cap | ❌ | none | OT in payroll is random seed data |
| 22 | JMR and shift logbook | ❌ | DPR only | No measurement entity or client sign-off |
| 23 | Hindrance register, EoT, variation orders | ❌ | `SiteIssue` (title/severity/status) | Nothing blocks unapproved items on invoices |
| 24 | Variation and change-in-law claims | ❌ | 18% hard-coded | No tax-basis, escalation type, wage-delta engine |
| 25 | Tax reconciliations (GSTR-7, TDS, Rule 37A) | 🟡 data only | `GstTransaction TDS_RECEIVED`, `gst-summary.tsx` | TDS received is seeded equal to the deduction, so nothing is reconciled |
| 26 | Receivables and MSME clock, TReDS, CPSE flag | ❌ | `Organisation` has name/gstin/address/state only | Clock runs from invoice date + terms, not acceptance date; no interest calculator |
| 27 | Contract P&L and cash-flow forecast | 🟡 | `CostEntry`, `ProjectBudgetLine`, `getBudgetVsActual` (unused), `getRevenueExpenses` | Cost side exists keyed by project, but labour is a synthetic seed top-up not tied to payslips; margin is company-wide by month; health ignores margin; no forecast or CC-limit alert |
| 28 | Credentials library and PQ calculator | ❌ | `Tender.eligibility` free text | |
| 29 | Rate analysis and BOQ costing | ❌ | `BoqItem`, `Bid.quotedAmount` | No wage master, below-cost flag or eRA floor |
| 30 | Safety and incident module | ❌ | free-text issues | |
| 31 | Licence and Shram Suvidha register | ❌ | document-type label only | `Document` has no `validTo` |
| 32 | Workflow builder, global search | 🟡 | `settings-view.tsx`, `import-export.tsx` | Add-only masters; approval flows fixed; no custom fields, no global search |

### 3.3 P2

| # | Capability | Status | Evidence | Gap |
|---|---|---|---|---|
| 33 | Tender discovery import, portal registry | 🟡 | `TenderPortal` (name, URL), CSV import | No aggregator parsing, keyword rules, de-duplication, enlistment registry |
| 34 | Competitor master, win/loss analytics | 🟡 | `CompetitorBid`, `Bid.isL1/percentVsEstimate`, win-rate KPI | Competitor is a string; no loss codes, no hit rate by client/plant |
| 35 | Bid intelligence from own cost history | ❌ | raw data exists, no code | |
| 36 | Compliance-risk prediction, director copilot | ❌ | fixed attention rules only | No bill-readiness model to predict from |
| 37 | Workforce takeover, local quota, dispute register | ❌ | | |
| 38 | Worker self-service (WhatsApp payslips etc.) | ❌ | | No UTR per worker |
| 39 | Regulatory watch feed | ❌ | | No rules library to feed |
| 40 | Close-out cockpit and "money still locked" | ❌ | pieces: `SecurityInstrument`, `RetentionEntry`, `getRetentionSummary` (unused) | |

### 3.4 Scenario tables: what the app cannot handle at all

No data model and no screen exists for any of the following.

**Tender side.**
- Portal master with DSC mapping, login owner and registration expiry; enlistment register; portal registration tracker; keyword rules and aggregator import; source-of-truth portal and date-change conflict flag.
- Scored bid/no-bid scorecard; corrigendum log and impact form; pre-bid query register.
- DSC register and signatory availability; valid-on-date document check; PAN/GST/Udyam mismatch check; submission-attempt log; physical-submission milestone.
- Works/service/goods classification driving EMD exemption; BG request generator; BG validity calculator; bank-wise BG limits; EMD refund follow-up drafts.
- Credentials library, PQ calculator, FY financials with UDIN; rate-analysis engine and below-statutory-cost flag.
- GeM 48-hour representation timer; eRA log and floor price; counter-offer / MSE match; bid-validity tracker; retender link; loss-reason codes.
- LoA task chain, PBG calculator.

**Execution side.**
- Licence register (old CLRA and new OSH), Shram Suvidha 15-day intimation, jurisdiction attribute driving wage tables.
- Per-worker onboarding pipeline, KYC and bank validation, bulk appointment letters, expiry calendar, substitute-request workflow.
- Skill matrix, scaffold tags, permit-to-work, toolbox talks, incident module.
- Gate-log reconciliation; shift fill-rate; OT cap and 2x rate; reliever roster.
- Wage master by effective date × jurisdiction × skill with auto-arrears; firm-price/variation clause per contract; mid-month EPF ceiling change; bank-bounce handling and 7-day wage countdown; advance ledger with caps; bonus/gratuity provisioning; F&F; EIC disbursement certificate; ECR/ESIC/bank files; monthly register pack.
- Workforce takeover; worker-origin quota; dispute register; JMR; shift logbook; hindrance register and EoT builder; free-issue material ledger; subcontractor compliance portal and payment hold.

**Billing side.**
- Bill-readiness pack and block on "submitted"; PSU bill-stage pipeline; unbilled-month detection.
- Draft-for-certification vs tax invoice; IRN and the 30-day e-invoice rule; 20-day ageing alert.
- Tax basis and GST 12→18% differential claim; VDA auto-claim; variation-order register.
- Deduction-level receipt allocation and dispute items; expected-vs-credited GST-TDS; TAN/quarter TDS ledger; cess flag per contract.
- Retention release-due alert; BG 90/60/30 alerts beyond the existing 45-day PBG alert; BG cost in P&L.
- MSME 45-day clock and interest; TReDS; CPSE vs state-PSU flag; Samadhaan pack.
- Contract cash forecast, cash-gap alert vs CC limit; subcontractor GSTR-2B gate and 43B(h) ageing; close-out checklist; Tally sync.

The app *partially* handles: tender dates (no corrigenda), EMD/PBG display and a PBG-expiry alert, the 6-stage pipeline and history, GO/NO-GO display, conversion for seeded Won tenders, attendance marking, invoices with tax split and per-GSTIN GST summary, subcontractor work orders with retention %, daily reports and site issues.

---

## 4. Uniqueness check

| Differentiator | Verdict | Reasoning from the code |
|---|---|---|
| **Work order as the central record** | **Partly supported** | `Project` is the work-order record (work order no/date, organisation, GSTIN, billing cycle, terms, value, `tenderId`). `Attendance`, `Invoice`, `DailyWorkReport`, `BoqItem`, subcontractor work orders and bills, POs, vendor invoices, `CostEntry`, `RetentionEntry` all carry `projectId`. **`Payslip` and `PayrollRun` carry none** (payroll is keyed by month and region; salary payments seed `projectId: null`), so labour cost cannot reach a contract through pay. `Project` lacks the clause fields (LD, DLP, escalation, tax basis, deployment norms, unit GSTIN). Naming collision: `workOrders` in the database means *subcontractor* work orders. Additive change, not a rewrite |
| **Compliance pack per monthly bill** | **Needs structural change** | `Invoice` has no link to wage register, challans or bank proof. No challan, ECR, UTR or checklist entity; `Document.validTo` doesn't exist; the only checklist is tender-stage. `Document`/`DocumentLink` (polymorphic) could carry attachments. Needs bill-pack and per-contract checklist template entities plus per-worker payment proof (payslip has no UTR) |
| **Attendance reconciled against PSU gate records** | **Needs structural change** | Supervisor-side attendance exists with `projectId`, `source`, `clientUuid`. No gate-log entity, import path or matching logic; DPR headcount is never compared. Add a gate-log entity and a three-way match (gate, supervisor, payroll) |
| **Ledger of money locked with the client** | **Partly supported** | Parts exist: `SecurityInstrument` (EMD, PBG, ABG, SD) with events, client `RetentionEntry`, `InvoiceDeduction` by type, net receivable vs received, EMD/PBG payment purposes. Nothing joins them, `getRetentionSummary` is unused, there are no release triggers or dates, no "uncredited TDS" state, and instruments require a `tenderId` so a standalone ABG or SD can't be created. Mostly a read model plus release-trigger fields |
| **P&L per contract** | **Partly supported** | Cost side is keyed by project (`CostEntry` with source type, `ProjectBudgetLine`, 88% planned cost in seed). But labour cost is a synthetic top-up not fed by payslips; no BG/financing cost; penalties and retention not modelled as cost; the dashboard margin is company-wide per month; `getBudgetVsActual` has no caller. Needs payroll allocated to projects first |
| **Dated rules engine** | **Needs structural change** | None exists. Rates are file constants (the seed comment says "move to settings later"). The only dated records are `validFrom/validTo` on GSTIN registrations. Needs a rule table with effective-from/to, jurisdiction, source document and a recompute/arrears path, and every consumer (payroll, GST, TDS, PBG %) must read from it |
| **Bid pricing from actual costs** | **Needs structural change** (data is present) | `Bid`, `BoqItem` and `CostEntry` can be joined through the 1:1 tender→project link, but there is no cost-per-man-day calculation, no wage master, and labour cost isn't real payroll. Depends on the rules engine and project-level payroll |

**Net:** the design has the right hub (`Project`) and good seams, but three of the seven differentiators depend on two structural moves that haven't started: payroll tied to contracts, and effective-dated rules. Both should precede the UI work for them.

---

## 5. Technical production readiness

| Item | Status | Evidence |
|---|---|---|
| Real database and migrations | **Missing** | No `prisma/`, `*.sql` or DB driver. `src/types/database.ts` is an in-memory interface. `docs/data-model-full.md` says "not yet built". CLAUDE.md still references `docs/data-model.md` and `prisma/schema.prisma`, neither of which exist |
| Backend API, server-side validation | **Missing** | No `route.ts`, server action, middleware/proxy, or Zod. Validation is client-side in `src/modules/*/entry.ts`. No transactions |
| Real authentication | **Missing** | Persona switcher `components/layout/role-switcher.tsx`, user id in localStorage (`store/session-store.ts`). No login, sessions, password reset |
| Server-side permission checks with scopes | **Missing** (UI-level model **Partial**) | `lib/data/access.ts` (`getScope`, `can`, `canView`) is labelled "NOT security". `canView` hides nav and tiles; `can` is used only in `convert-to-project.tsx`. `OWN_PROJECTS`/`OWN_SITES` are never applied; only the region filter is. Any persona with page access can write |
| Audit trail | **Missing** at runtime | `types/audit.ts`, `listAuditLogs` (`lib/data/notifications.ts`), seeded in `seed/platform.ts`. No code writes an entry; no viewer; `remove()` is a hard delete. Related partial records: `tenderStageHistory`, `approvalActions`, `projectConversions` |
| File storage | **Missing** | Only `<input capture>` in `daily-work/new/page.tsx`; files held in memory, count saved. No upload, S3, size limit or compression |
| Scheduled reminders, email, WhatsApp/SMS | **Missing** | No cron/jobs/mailer. Notifications are seeded at build time; deadline bands computed live in `tenders/deadline-list.tsx`. No channel field on `Notification` |
| Security (OWASP) | **Missing** | `next.config.ts` sets no security headers or CSP. `dangerouslySetInnerHTML` appears once (`components/ui/chart.tsx:94`, static shadcn theme style, low risk). No server so CSRF/rate limiting are moot until one exists. `.gitignore` does ignore `.env*`; there is no `.env.example` |
| Sensitive data (Aadhaar, PAN, bank, salary) and DPDP Act | **Missing** | No Aadhaar or bank-account fields exist yet. Wages, advances and UAN are in the browser bundle and localStorage, shown unmasked (`employees/payroll/page.tsx`) and exported in plain CSV (`employees/page.tsx`). Company/supplier PAN and GSTIN in seed. No masking, consent, retention, erasure or notice code. Must be designed before any real employee data is loaded; the research report adds Aadhaar/bank/UAN onboarding, which will make this worse |
| Backups | **Missing** | No database. Only `resetDemoData` and per-table CSV export |
| Excel import/export, PDF export | **Partial** | CSV only (`lib/csv.ts`, `components/data/import-export.tsx`, six entities). No xlsx or PDF library, no print CSS, no invoice or payslip PDF |
| Responsiveness 360 / 768 / 1280 | **Partial, unverified** | Static evidence: DataTable switches to cards below `md` (`components/shared/data-table.tsx`), drawer and bottom nav exist, buttons are 44px on mobile. Risks: header overflow at 360px (L1, high), DataTable wrapper is `overflow-hidden` so wide tables clip between 768 and about 1000px, fixed widths in `daily-work/new`, `grid-cols-7` calendar in `command-centre.tsx:235`, KPI values may truncate at 160px tiles. **No width was tested in a browser** |
| Accessibility incl. yellow accent | **Partial** | Skip link (`app-shell.tsx:47`), global `:focus-visible` in accent-strong (`globals.css`), widespread `aria-*`, `<html lang>`, sr-only table captions, 44px touch targets. Yellow handled by design: `--accent` is fill only, dark text on it (9.93:1), `accent-strong` (#856000) for text/icons/focus (5.7:1 on white); greps found no yellow-as-text and the only `text-white` is on `bg-status-danger`. Gaps: yellow chart series is 1.8:1 on white (outline rule not verified per chart); `/5` status row tints not covered by the contrast script; no keyboard or screen-reader testing; no reduced-motion handling confirmed |
| Loading, empty and error states | **Partial** | Skeleton until hydration, DataTable skeleton rows, EmptyState widely used. **No `loading.tsx`, `error.tsx`, `not-found.tsx`, `global-error.tsx` or error boundary**; a render exception shows the Next default page; `formatINR` can throw (B19) |
| Offline and PWA for site staff | **Missing** | No manifest, no service worker; only `themeColor` and an icon. DPR form state is lost on refresh; no photo compression. `Attendance.clientUuid` is a type-level idempotency key with no queue behind it |
| Tests, especially money logic | **Missing** | No runner or test files. Only `scripts/check-seed.ts` (about 100 invariants) and `check-contrast.ts`. **Untested:** `lib/money.ts` (paise arithmetic, `formatINR`), `modules/finance/entry.ts` (GST split, rounding, due dates, numbering), `lib/data/gst.ts`, `accounts.ts` (receivables, payables, retention), PF/ESI/PT/net salary (seed only), `lib/dates.ts`, `lib/csv.ts`, `access.ts` |
| CI/CD, environments, logging, monitoring | **Missing** | No `.github/`, Dockerfile, `vercel.json`, Sentry or logging code, no staging/production split. Working tree has uncommitted changes |
| Documentation | **Partial** | README (run guide), CLAUDE.md, `docs/system-flow.md`, `docs/client-profile.md`, `docs/data-model-full.md`. Stale references to `docs/data-model.md`, `prisma/schema.prisma`, `docs/client-requirements.pdf`. No API, deployment, runbook or user guide |

What **is** sound: money is integer paise (`lib/money.ts`) rather than floats; lint/typecheck/build are clean with zero `any`/`@ts-ignore`; design tokens and contrast are enforced by script; IST handling in `lib/dates.ts` is correct (fixed +05:30).

---

## 6. Bugs and inconsistencies

Severity is by effect on money, compliance or trust in numbers. IDs B1–B26 continue the earlier audit and were re-checked against current code; new ones have new IDs. Paths are under `src/`.

### 6.1 High

| ID | Issue | File |
|---|---|---|
| B1 | New and imported invoices get `customerGstin = org.gstin ?? "UNREGISTERED"`, and every organisation has `gstin: null`, so UI-created invoices would be filed as B2C. Seeded customer GSTINs use a fake check letter (verified) | `modules/finance/entry.ts:103`, `lib/data/seed/org.ts:243` |
| P1 | **EPF wage ceiling is Rs 15,000** and applies to the 2026-09 payslips; the research report gives Rs 25,000 from 17-Sep-2026. Example: gross 22,000 gives employee PF 1,800 against 2,640. Not date-versioned, so a split month can't be computed (verified constant) | `lib/data/seed/payroll.ts:12,45-47` |
| B2 | No audit entry is ever written (violates CLAUDE.md principle 4) | `lib/data/notifications.ts:26` and whole app |
| B3 | Approving/rejecting changes only the approval rows, never the PO, bill, payroll run or tender | `components/approvals/approvals-inbox.tsx:59-62` |
| N1 | The header "as-of" date only moves the clock. Invoices, payments, bills and payslips dated after it are still counted, so setting 2026-06-30 still includes July–October invoices. Typed future dates are accepted | `components/layout/date-filter.tsx:19-25`, `lib/dates.ts:17-22` |
| L1 | Header at 360px: menu, logo, region button (up to `max-w-28`), date input (fixed `w-37`, 148px, plus reset), bell and avatar total roughly 500px in a 360px bar with no wrapping | `components/layout/header.tsx:14-24`, `date-filter.tsx:24`, `region-filter.tsx:36` |

### 6.2 Medium

| ID | Issue | File |
|---|---|---|
| B4 | Seed invoice number `SPH/CG/2025-26/0001` is 19 chars (GST limit 16) and new numbers inherit it; "latest" is chosen by string sort (`…/0999` > `…/1000`); sequence never resets on 1 April | `modules/finance/entry.ts:46-48`, `seed/accounts.ts:116` |
| B5 | `Date.parse` accepts impossible dates (2026-02-30) and future dates; invoice import rejects DD-MM-YYYY while other importers accept it | `modules/finance/entry.ts:28,71` |
| B6 / G1 | Invoice form allows any of the four GSTINs, defaulting to the first rather than the project's. Choosing Delhi's GSTIN for a Chhattisgarh plant flips CGST+SGST to IGST. No check that the GSTIN's state code matches `stateId`, no place-of-supply field stored | `components/finance/invoice-form.tsx:55,62,77`, `entry.ts:89-92` |
| B7 | A new invoice with GST-TDS or retention creates no retention entry or `TDS_RECEIVED` transaction; recording payment creates none, so net-GST and retention summaries are wrong for UI-created invoices | `modules/finance/entry.ts:123-146`, `lib/data/gst.ts:40` |
| B8 | Dead drill-downs: `/tenders?stage=`, `/finance?…overdue=1`, `&ageing=` and `/projects?focus=` (after conversion) land on unfiltered lists. `?customer=` is fixed | `components/dashboard/charts.tsx:54,178`, `attention.tsx:139`, `command-centre.tsx:117`, `tenders/convert-to-project.tsx:26,56` |
| N2 | "Attendance not marked" attention item links to `/employees` instead of `/employees/attendance/mark` | `lib/data/dashboard.ts:126` |
| B9 | Ageing is days since invoice on Finance but days past due on the dashboard, with different buckets, so the same invoices total differently | `finance/receivables.tsx:22`, `dashboard13.ts:391` |
| T3 | Urgency thresholds disagree: ≤3 days "urgent" (`dates.ts:110`), danger at ≤2 (`urgency.ts:8`), attention danger at ≤3 (`dashboard.ts:55`), command centre ≤2. A tender due in 3 days is red on one screen and amber on another | listed |
| B10 | "Subcontractor payable" has four definitions across `parties.ts`, `dashboard13.ts`, `accounts.ts`, `subcontractors/page.tsx`; assignment balance includes rejected/draft bills | listed |
| B11 | `deletedAt` is ignored in project billing, payables, GST summary, dashboard bills and retention (latent: no delete action yet) | `accounts.ts:69,107,118`, `parties.ts:24-25`, `gst.ts:13` |
| B12 / P4 | Advance recovery on payslips is random and never reduces `advanceBalance`, so "advance outstanding" is overstated | `seed/payroll.ts:50`, `workforce.ts:131` |
| B13 | PF on gross including OT; employer share a flat 12% (no EPS 8.33 / EPF 3.67 / EDLI / admin); "Remitted" means run locked; no ESI status/due date; professional tax flat 200/200/208/0 above 15,000 | `seed/payroll.ts:12-17,45-51`, `dashboard13.ts:322` |
| B14 | Payslip days and OT are random, not derived from attendance; proration rounds the percentage to 2 decimals (24 days on 20,000 gives 18,462.00 instead of 18,461.54) | `seed/payroll.ts:40-44` |
| B15 | Employee builder uses `Number(s).toFixed(2)` (accepts `1e3`, `0x10`); ESI applicability not derived from wage | `modules/workforce/entry.ts:48-53,104` |
| B16 | Conversion leaves GSTIN `""` when the tender has none, manager null, payment terms hard-coded 30; project code is `count + 1` with no collision loop | `lib/data/tenders.ts:255-279` |
| B17 | GSTIN checked by format only (no state-code or PAN match), duplicates checked by name only; seed sub-bill GST uses subcontractor vs project state but records the project GSTIN | `modules/subcontractors/entry.ts:26-45` |
| T1 | EMD entered at registration never becomes an instrument, so "EMD locked" omits UI-created tenders | `modules/tenders/entry.ts:99,135`, `lib/data/tenders.ts:180-192` |
| T5 | Empty BOQ gives 0% progress, so every new or converted project turns Amber then Red; completed projects under 85% also show red | `lib/data/projects.ts:33-51`, `dashboard.ts:133` |
| N3 | Attendance "not marked" alert fires on Sundays/holidays with zero rows | `workforce.ts:53-60` |
| L2 | Fixed/min widths likely to pinch at 360px | `daily-work/new/page.tsx:112,138`, `employees/page.tsx:127,141`, `projects/[id]/detail.tsx:43,190`, `subcontractors/[id]/detail.tsx:55` |
| BUILD | Recharts prerender warning `width(-1) height(-1)` ×4 in `next build` | chart containers (not traced to a file) |

### 6.3 Low / info

- **B18** CGST rounded half-up, SGST = remainder; odd-paisa tax gives CGST > SGST by 0.01 (`entry.ts:91,110-111`).
- **B19** `toPaise` throws on malformed strings, so a bad value crashes a render; compact format picks the unit before rounding (99,99,999.99 shows "₹100.00 L") (`lib/money.ts:14-19,88-93`).
- **B20** `Number()` comparisons on money; over-receipt drops an invoice from receivables (`accounts.ts:42,52`).
- **B21** `useUrlParam` has a no-op subscribe; list filters are lost on navigation (`lib/use-url-param.ts`).
- **B22** `/home` duplicates `/dashboard`; `entityHref` sends purchase types to `/daily-work`; `tenders/[id]` doesn't `decodeURIComponent` (`links.ts:16-17`, `app/tenders/[id]/page.tsx:14`).
- **B23 / N4** Missing-report logic ignores site cutoff; weekly off hard-coded Sunday; HOLIDAY not treated as off; `reportsToday` counts drafts while `getMissingReports` doesn't (`sites.ts:29,70,73`).
- **B24 / T6 / T7** "Employees", "active projects" and "billed" are each defined two ways; the "convert" attention item checks `systemKey` while conversion checks `kind` (`dashboard13.ts`, `dashboard.ts:80,176`).
- **G2–G6** GST % accepts any number 0–40; deductions unconstrained and TDS not checked against 2%; payment terms and due-day literals duplicated in five files; "not yet due" bucket includes due-today; payment date/mode/UTR can't be entered.
- **T2 / T4** Tender deadline can be in the past; days-left ignores time of day.
- **P2 / P3** PT threshold and ESI ceiling hard-coded; future-dated site assignments counted as current.
- **N5 / N6** `getSiteStock` ignores `deletedAt`; tender stepper hard-codes `grid-cols-5`.
- **B25** Detail pages for UI-created ids (outside `generateStaticParams`) were not tested.
- **B26** Demo clock frozen; `createdAt` still uses the real clock.
- **S1–S3** Dead code: `bottom-nav.tsx` notification badge (nav module removed), `inNav` flag, `module-placeholder.tsx`, unused `ui/{badge,card,separator,table}`, ~40 unused data exports; stray `tender-crm/` scaffold and five template SVGs in `public/`; "needs attention" built in three places, which is how T3 and N2 diverged.
- Duplicate files at repo root: `research-report.md` and `Government contractor operations and CRM market.md`.

### 6.4 Hard-coded rules that CLAUDE.md says must be configuration

| Rule | File |
|---|---|
| Dashboard variant chosen by role-key strings (`site_engineer`, `accounts`, `project_manager`, …) | `components/dashboard/home.tsx:37-67` |
| Stage `systemKey` (`SUBMITTED`, `UNDER_EVALUATION`, `WON`) in logic | `lib/data/tenders.ts:152,158`, `urgency.ts:7`, `tender-detail.tsx:41,177`, `tender-list.tsx:73,170` |
| Project status keys (`COMPLETED`, `IN_PROGRESS`, `pst_mobilisation`) | `dashboard13.ts:113,156`, `projects/page.tsx:23`, `tenders.ts:278`, `projects/entry.ts:211` |
| Payment terms 30 days | `accounts.ts:120`, `dashboard13.ts:233`, `tenders.ts:270`, `projects/entry.ts:259` |
| GST default 18%, range 0–40, filing due 11th, default deduction `ded_tds_it`, invoice FY format | `modules/finance/entry.ts:40,51,79-80,124,177` |
| PF 12% / 15,000, ESI 0.75/3.25/21,000, PT table and threshold, PF due 15th | `seed/payroll.ts:12-17,51`, `seed/workforce.ts:44`, `dates.ts:128` |
| Health thresholds 5% / 15% | `lib/data/projects.ts:11` |
| Reminder bands 7/3/1, urgent at 2 or 3 days, windows 7/14 days | `tenders.ts:157,210-216`, `dates.ts:102`, `dashboard13.ts:54`, `dashboard.ts:51` |
| Approval due +2 days at 18:00; approver rule by estimate | `modules/approvals/entry.ts:387` |
| Weekly off = Sunday | `lib/data/sites.ts:70` |
| Code formats (`SPH-###`, `SPH/<region>/WO/…`) | `workforce/entry.ts:59-62`, `projects/entry.ts:201`, `tenders.ts:262`, `subcontractors/entry.ts:105` |
| Retention 5%, TDS 2%, PBG window 45 days, EMD follow-up 30 days | `subcontractors/page.tsx:126`, `seed/accounts.ts:131-135`, `dashboard.ts:106,111` |

---

## 7. Prioritised gap list and roadmap

Effort: **S** ≤ 2 days, **M** ≈ 1–2 weeks, **L** > 2 weeks (one developer, rough, my estimate). P0 = blocks go-live; P1 = first quarter; P2 = later.

### Phase A: Foundation (sequential, the critical path)

| Pri | Gap | Eff | Notes |
|---|---|---|---|
| P0 | PostgreSQL + Prisma schema and migrations from `docs/data-model-full.md`; seed separated from real data | L | Everything else depends on it. Decide here: project-level payroll (`projectId` on payslip/run) and instruments not tied to `tenderId` |
| P0 | Auth.js, sessions, password reset; remove the persona switcher from production | M | After DB |
| P0 | Server-side `can(user, permission, scope)` on every route/action; enforce region/project/site scope | M | After auth |
| P0 | Service layer with Zod and transactions; move `modules/*/entry.ts` rules server-side | L | Parallel with permissions once the schema stabilises |
| P0 | Audit-log writes in the same transaction, with before/after and mandatory reasons; viewer page; replace hard delete with soft delete | M | After service layer |
| P0 | CI (lint, typecheck, test, build), environments, hosting, backups, error tracking, `.env.example` | M | Can start immediately in parallel |
| P0 | Sensitive-data protection and DPDP basics (field encryption/masking, access logging, consent, retention, erasure) | M | Before any real employee data |

### Phase B: Statutory core (sequential internally; depends on A's schema)

| Pri | Gap | Eff | Notes |
|---|---|---|---|
| P0 | **Effective-dated rules engine** (PF/ESI ceilings and rates, PT, GST rate, TDS/cess, minimum wage/VDA, PBG/EMD %) with source and arrears (#7) | L | Fixes P1 and every hard-coded rule in 6.4. Must precede payroll and costing |
| P0 | Payroll engine: attendance-driven, multi-site, daily-rated, ECR/ESIC/bank files, 7-day countdown, advance ledger, F&F, OT at 2x; payroll tied to contract (#8) | L | After rules engine |
| P0 | Invoice correctness: customer GSTIN, number format ≤16 and FY reset, date validation, GSTIN/state match, TDS/retention side effects (B1, B4–B7, B18, G1–G3); draft vs tax invoice and IRN ageing (#12) | M | Can run beside payroll |
| P0 | Money-logic unit tests: `money.ts`, GST split and rounding, PF/ESI/PT, net salary, balances, ageing, dates | M | Start in Phase A, grow with each rule |
| P0 | Contract master clause fields (#1): unit GSTIN, jurisdiction, tax basis, escalation, LD, retention/SD/PBG terms, DLP | M | With schema |

### Phase C: Workflows made real (largely parallel, each on its own module once A is done)

| Pri | Gap | Eff | Notes |
|---|---|---|---|
| P0 | Tender workflow: stage transitions, GO/NO-GO writing a decision, bid/result/award, checklist updates, EMD/PBG actions, corrigenda and milestone dates (#2–#6) | L | Parallel agent 1 |
| P0 | Approval engine acting on source records, multi-level, thresholds, self-approval guard, maker-checker (#15, B3) | M | Parallel agent 2 |
| P0 | Financial-instrument ledger with release triggers, validity calculators, alerts; retention release (#6) | M | Parallel agent 3 (shares schema with tender work; agree interfaces first) |
| P0 | Bill lifecycle and bill-readiness pack per work order; receipt allocation to deductions (#10, #11, #13) | L | Needs payroll proofs from Phase B |
| P0 | Worker onboarding pipeline with KYC/UAN/bank validation and expiry calendar (#9) | M | Parallel agent 4; needs sensitive-data controls |
| P0 | Subcontractor bill/payment entry and compliance gate; one definition of "payable" (#14, B10) | M | Parallel agent 5 |
| P0 | Document vault with expiry and valid-on-date gating; real file storage with limits and compression (#4) | M | Parallel with the above |
| P0 | GST filing actions (mark filed, reference, period view) and GSTIN-wise calendar (#17) | M | |
| P0 | Error/not-found/loading boundaries; fix header overflow (L1), as-of date semantics (N1), dead drill-downs (B8, N2), threshold consistency (T3), ageing (B9) | S | Quick wins, do early |

### Phase D: Field and mobile (P1, parallel with C after A)

| Pri | Gap | Eff |
|---|---|---|
| P1 | PWA with offline queue, gang attendance, photo compression, geofence, Hindi/Marathi (#20) | L |
| P1 | Gate/CLIMS import and three-way reconciliation with T+1 exceptions (#19) | M |
| P1 | JMR and shift logbook; hindrance/EoT/variation registers; daily report updates BOQ progress (#22, #23) | M |
| P1 | Shift roster, fill-rate, OT budget (#21); safety and incident module (#30); licence and Shram Suvidha register (#31) | L |
| P1 | Notification engine: scheduled jobs for deadlines, PBG/EMD, DSC, PF; email and WhatsApp/SMS | M |

### Phase E: Money intelligence (P1, after B and C)

| Pri | Gap | Eff |
|---|---|---|
| P1 | Contract P&L and cash forecast; cash-locked ledger view (#27, "money locked") | M |
| P1 | Change-in-law/VDA/GST-differential claims engine (#24) | M |
| P1 | Tax reconciliations: GSTR-7, TDS by TAN/quarter, Rule 37A (#25) | M |
| P1 | MSME clock, TReDS fields, CPSE flag (#26) | S–M |
| P1 | Credentials library and PQ calculator (#28); costing engine (#29) | L |
| P1 | Settings editors for every item in 6.4; workflow builder; global search (#32) | L |
| P1 | Tally integration; .xlsx and PDF export (#18) | M |
| P1 | Playwright e2e on desktop and 360px; permission and conversion integration tests | M |

### Phase F: Later (P2)

Tender discovery import and enlistment registry (#33); competitor master and loss codes (#34); bid intelligence from own costs (#35, needs B + E); compliance-risk prediction and copilot (#36); workforce takeover and quota (#37); worker self-service (#38); regulatory feed (#39, depends on the rules engine); close-out cockpit (#40); purchases/vendors/stock screens; accessibility and responsive pass at 360/768/1280/1440 with keyboard testing; user guide; cleanup of dead code (`/home`, unused UI files, `tender-crm/`, template SVGs, duplicate research file).

**Parallelism.** Strictly sequential: DB → auth → permissions → audit; rules engine → payroll → bill-readiness pack → bid intelligence. Parallelisable once the schema is stable: tender workflow, approvals, instruments, onboarding, subcontractor workflows, documents, GST actions (separate modules; agree schema ownership and shared types first to avoid merge conflicts). Independent from day one: CI/CD, money unit tests, quick-win UI fixes, PWA groundwork.

---

## 8. Executive summary

**How far from production?** This is a polished, internally consistent front-end prototype, not a system that can hold real money, workers or bids. The visible UI is far along: lint, typecheck and build are clean, design tokens and contrast are enforced, all 13 client dashboard items are populated, and money is handled safely in integer paise. But there is no database, backend, login, server-side permission, audit write, test or deployment; the browser's localStorage is the only store, and it holds salaries and PAN. Most workflows stop after "create": tenders cannot change stage, approvals do nothing to records, payroll and GST filing cannot be actioned, and subcontractor bills cannot be entered. Measured against the research report, the app is a competent shell for the report's "skeleton" and lacks nearly all of what makes the product different. My judgement, not a measurement: roughly half of the screens exist, about a quarter of the functional behaviour, and under a tenth of the PSU-specific differentiation. Expect on the order of 6–9 developer-months to reach a defensible go-live (Phases A–C), assuming the two structural moves below are made first.

**Top 10 gaps**
1. No database or backend; all data lives in the browser.
2. No real authentication, and permissions and scopes are UI-only.
3. No audit trail is ever written.
4. No tests, including GST, PF/ESI, net salary and balances; no CI, hosting or backups.
5. Statutory rates are hard-coded (EPF ceiling already stale at Rs 15,000); no effective-dated rules engine.
6. Payroll exists only as seeded numbers: no run, no ECR/ESIC/bank files, and payslips aren't tied to contracts.
7. Tender workflow can't be driven, so a user-registered tender can never reach Won or be converted.
8. No bill-readiness pack, PSU bill-stage tracking or deduction-level receipt reconciliation, which the research report identifies as where the money is withheld.
9. Invoice creation produces unsafe GST data (UNREGISTERED customer GSTIN, over-length numbers, impossible dates, wrong-GSTIN IGST flips).
10. No file storage, PWA/offline, or notification delivery (email/WhatsApp).

**Biggest risks**
- **Compliance and privacy:** real employee wages, UAN and, soon, Aadhaar/bank details would sit unencrypted in browser storage with no DPDP controls.
- **Wrong pay and wrong tax from stale rules:** PF ceiling is out of date and not versioned; PF base, employer split and PT are simplified.
- **Numbers a director can't trust:** the same figure is defined differently on different screens (ageing, payable, billed, active projects, urgency), and the as-of date picker doesn't actually filter data.
- **Scope perception:** screens look finished while many are display-only; stakeholders may assume workflows work.
- **Design lock-in:** if the MVP's modules are rebuilt as silos with hard-coded rates, the operations–billing–payroll disconnect the research report warns about is reproduced. Payroll without `projectId` and instruments tied only to tenders are the concrete examples.
- **Unverified requirements and runtime:** the client PDF isn't in the repo, and no browser testing was done here (responsiveness, console errors, detail pages for new records are unverified).

**Questions to confirm with S. Prince before building**
1. Can we have the client requirements PDF? Does it add anything beyond `docs/client-profile.md`?
2. **Contract clauses:** for one NTPC manpower, one CSPGCL manpower and one painting/basalt works contract, what do GCC and payment terms say on escalation (firm price / statutory variation / PVC), LD, retention and SD, DLP, subletting, JMR, hindrance and bill documents? The research report did not obtain actual GCC text.
3. **MSME status:** what is S. Prince's Udyam category (micro/small/medium)? It decides EMD exemption (for services, not works), MSE price-match, 45-day payment and interest, and 43B(h) exposure.
4. **Client portals:** do state gencos (CSPGCL, MSPGCL, MPPGCL, TANGEDCO, KPCL, DVC) have portals like NTPC's CLIMS and bill tracking, and can gate exports or bill status be obtained from them?
5. **Tally:** do they use Tally (which edition and who keeps the books)? Is the CRM meant to feed it, replace parts of it, or only reconcile with it?
6. How are bills assembled today, and what documents have caused rejection in the last year? Which clients accept or require which proofs?
7. Which statutory rules do they currently follow: EPF ceiling (Rs 15,000 vs 25,000), ESIC due date (15th vs 21st), Chhattisgarh Labour Code rule status, and TDS/cess on their invoices (s.393, BOCW cess on painting and manpower)? Who at the CA firm signs these off?
8. Do they bill each PSU unit GSTIN separately, and how are plants in states without a GSTIN billed?
9. Scale and shape: headcount per contract (the research report assumes ~5,000 workers), daily vs monthly wages, how wages are paid (bank vs cash), and whether gate biometrics are used.
10. Hosting and data: any residency preference, who owns backups, and who holds the Class 3 DSCs (relevant to document-vault design).
11. Languages and devices for site staff (Hindi/Marathi, low-end Android, offline expectations).
12. Which of the 40 research capabilities do the directors want first? The research report's own suggestion is to walk the three live contracts above through the P0 list end to end and build wherever "why is this bill not paid, and how much of our money is with this client?" can't be answered.
