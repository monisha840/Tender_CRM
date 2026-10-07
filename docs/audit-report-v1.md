# Audit report: S. Prince Management Tool

Audit date: 2026-10-07 (the app's fixed demo "today"). Read-only: no application code was changed; this file is the only thing written.

**How this was produced.** Five parallel read-only Explore agents covered client coverage, system-flow coverage, money logic, security/data/DevOps and frontend quality. I ran lint, typecheck, build, `seed:check` and `contrast:check` myself and spot-checked the findings that looked most surprising (noted as "verified"). Everything else is from reading code and was not run in a browser. Where the agents disagreed with the code, the code won.

**Important caveat on sources.** `docs/client-requirements.pdf` does **not exist** in the repo. Section 2 is therefore measured against `docs/client-profile.md`, the 13 dashboard items and field lists in `CLAUDE.md`, and the field lists asserted by `scripts/check-seed.ts`. If the real PDF contains more, this report understates the gap.

Status key: ✅ Done · 🟡 Partial · 🎭 UI only (mock/seed data, no real behaviour) · ❌ Missing. "Done" means working against the in-browser store plus seed, since there is no backend.

---

## 0. Check results

| Check | Result |
|---|---|
| `npm run lint` | Pass: 0 errors, 0 warnings |
| `npm run typecheck` | Pass on a clean build. (A first run failed only on stale `.next` types that referenced a deleted page; `next build` regenerated them.) |
| `npm run build` | Pass. 24 page routes; every detail route is pre-rendered from the seed |
| `npm run seed:check` | Pass: all integrity, client-field and 13-dashboard-item checks |
| `npm run contrast:check` | Pass: all token pairs meet WCAG AA |
| `npm test` / `npm run test:e2e` | **Do not exist.** No `test` script, no Vitest/Playwright/Jest dependency, no `*.test.*` or `*.spec.*` files |
| Browser/runtime checks (console errors, 360/768/1280px layout) | **Not run** |

---

## 1. Inventory

### 1.1 Tech stack (installed vs CLAUDE.md)

| Layer | Installed (from `node_modules`) | CLAUDE.md says | Gap |
|---|---|---|---|
| Framework | Next.js 16.4.0 (App Router, `cacheComponents: true`), React 19.3.0 | Next.js App Router | none |
| Language | TypeScript 5.9.3 | strict mode | not independently confirmed in this audit (typecheck passes) |
| Styling/UI | Tailwind 4.3.3, `@base-ui/react`, shadcn CLI 4.21, lucide-react, sonner, tw-animate-css | Tailwind + shadcn/ui | `shadcn` is a runtime dependency (belongs in dev). `cn` comes from the npm package `cn`; `clsx` is installed but **`tailwind-merge` is not**, so conflicting Tailwind classes are not merged |
| Charts | Recharts 3.8.0 | Recharts | none |
| State | Zustand 5.0.15 (localStorage-persisted) | n/a (stand-in for backend) | |
| Lint | ESLint 9.39.5 + eslint-config-next | | |
| Database/ORM | none | PostgreSQL + Prisma | ❌ |
| Auth | none | Auth.js | ❌ |
| Validation | none (hand-written in `src/modules/*/entry.ts`) | Zod for every input | ❌ |
| Storage | none | S3-compatible | ❌ |
| Jobs | none | scheduler | ❌ |
| Tests | none | Vitest + Playwright | ❌ |
| PWA | none | installable | ❌ |
| Script runner | `tsx` used via `npx --yes` for two scripts, not a devDependency | | minor |

Money is stored as **decimal strings** with BigInt-paise arithmetic (`src/lib/money.ts`), not JS floats. That satisfies the intent of the CLAUDE.md money rule (verified).

### 1.2 Routes

| Route | Renders | Main file |
|---|---|---|
| `/` | Client redirect to the persona's home path | `app/page.tsx` |
| `/dashboard` | Role-aware home (Director = command centre + 13 KPIs + charts) | `components/dashboard/home.tsx` |
| `/home` | **Exact duplicate of `/dashboard`**, unreferenced | `app/home/page.tsx` |
| `/approvals` | Approvals inbox | `components/approvals/approvals-inbox.tsx` |
| `/tenders` | Tender register (filters, charts, add/import) | `components/tenders/tender-list.tsx` |
| `/tenders/deadlines` | Deadlines grouped into 7/3/1-day bands + overdue | `components/tenders/deadline-list.tsx` |
| `/tenders/[id]` | Tender detail: stage stepper, EMD, award, checklist, convert | `components/tenders/tender-detail.tsx` |
| `/projects`, `/projects/[id]` | Project list/add/CSV; detail with Overview, Progress, Subcontractors, Billing, Daily reports | `app/projects/**` |
| `/subcontractors`, `/subcontractors/[id]` | Master list/add/CSV/assign; detail with assignments, bills, payments | `app/subcontractors/**` |
| `/employees`, `/employees/[id]` | Directory/add/CSV; detail | `app/employees/**` |
| `/employees/attendance`, `/employees/attendance/mark` | Monthly grid; mobile marking screen | `app/employees/attendance/**` |
| `/employees/payroll`, `/employees/payroll/dashboard` | Payslips per month; salary and PF charts | `app/employees/payroll/**` |
| `/finance`, `/finance/invoices/[id]` | Invoices / GST summary / Receivables tabs; invoice detail with record-payment | `components/finance/**` |
| `/daily-work`, `/daily-work/new`, `/daily-work/[id]` | Reports, manpower trend, issues; mobile-first entry; detail | `app/daily-work/**` |
| `/settings` | Read-mostly masters: stages, service lines, expense categories, roles, regions | `components/settings/settings-view.tsx` |
| `/styleguide` | Component reference, not in the nav | `app/styleguide/page.tsx` |

Notifications are no longer a page: a bell dropdown in the header (`components/notifications/notifications-menu.tsx`) lists the 8 most recent and links each to its record.

There is **no** `loading.tsx`, `error.tsx`, `not-found.tsx` or `global-error.tsx` anywhere.

### 1.3 Shared components

- `components/shared`: DataTable (sort, search, show-more, skeleton, mobile card mode), EmptyState, KpiTile (with sparkline), StatusBadge/DeadlineBadge, Timeline.
- `components/charts/chart-card.tsx`: ChartCard wrapper (title, unit, empty state, legend).
- `components/layout`: app shell (skip link, access guard), sidebar, mobile drawer, bottom nav, header, page header, region/date filters, role switcher.
- `components/data`: ImportExport (CSV), RecordForm (generic side sheet).
- `components/ui`: shadcn primitives. `badge`, `card`, `separator`, `table` and `layout/module-placeholder.tsx` are never imported.
- Feature folders: approvals, dashboard, finance, notifications, settings, tenders, work, workforce.

### 1.4 Data layer

- **Source:** deterministic seed built in `src/lib/data/seed/*` (40 tenders, 10 projects, 156 employees, 51 invoices, 204 daily reports, 11,870 attendance rows, 918 payslips, 106 approval requests, 12 subcontractors, 63 subcontractor bills).
- **Storage:** Zustand store (`src/store/data-store.ts`) holds the seed plus a per-table `changes` overlay persisted to browser `localStorage`. A seed-version bump discards a user's edits. Session (current user, region, as-of date) is also in `localStorage`.
- **Reads:** pure functions in `src/lib/data/*.ts` and `src/modules/*`. **Writes:** `upsert()` called straight from screens, plus `modules/*/entry.ts` builders for forms and CSV import.
- **No** API routes, server actions, middleware, database, `.env` files or migrations.
- The demo clock is fixed (`DEMO_TODAY = 2026-10-07`).

### 1.5 Scripts (`package.json`)

`dev`, `build`, `start`, `lint`, `typecheck`, `contrast:check`, `seed:check`. CLAUDE.md also lists `test`, `test:e2e` and Prisma commands; none exist.

---

## 2. Coverage vs the client brief

### 2.1 Dashboard: 13 items (`/dashboard`; selectors in `lib/data/dashboard13.ts`, tiles in `dashboard/kpi-grid.tsx`)

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | Active tenders | ✅ | Count, value, by stage, funnel chart. Chart drill-down link `?stage=` is **not read** by the tender list |
| 2 | Upcoming deadlines | ✅ | 7-day count, urgent, missing documents |
| 3 | Won / lost | ✅ | Win rate, values, by month |
| 4 | Active projects | ✅ | Green/amber/red health, weighted progress, planned vs actual |
| 5 | Project value | ✅ | Contract value, billed (taxable), yet to bill, by service line |
| 6 | Subcontractor work | ✅ | Assignments, progress, by trade |
| 7 | Subcontractor pending payments | ✅ | Approved and part-paid bills; overdue after a hard-coded 30 days |
| 8 | Employee count | ✅ | By department and region |
| 9 | Salary pending | ✅ | Latest payroll month only. Can never change in the UI (see 2.5) |
| 10 | PF status | 🟡 | Amounts from payslips. "Remitted" is a proxy (run LOCKED/PAID); no challan record |
| 11 | GST filed / due | 🟡 | Counted per invoice, not per return period; filing status can never be changed in the UI |
| 12 | Customer receivables | ✅ | Net of deductions, ageing, by organisation |
| 13 | Revenue / expenses | ✅ | 12 months. Revenue is taxable invoiced value, not cash |

### 2.2 Tender register, workflow, reminders, conversion

| Requirement | Where | Status | Notes |
|---|---|---|---|
| Tender fields (ID, organisation, name, scope, value, EMD, fee, dates, eligibility, documents, status) | `types/tender.ts`, `tender-detail.tsx` | ✅ view / 🟡 entry | Detail shows all. The add form and CSV have no eligibility, site, portal, GSTIN or published date, so new tenders show blank sections |
| Add tender / CSV import | `tender-entry.tsx`, `modules/tenders/entry.ts` | 🟡 | No edit screen. New tenders get no document checklist |
| Document checklist | `tender-detail.tsx` | 🎭 | Seeded and read-only; no status change, assignee or upload |
| Status workflow New → Under Evaluation → Bid Preparing → Submitted → Won/Lost | stepper + timeline | 🎭 | **Nothing changes a tender's stage after creation.** A tender can never be moved, won or lost in the UI |
| 7/3/1-day deadline reminders | `lib/data/tenders.ts` `reminderBand`, `deadline-list.tsx` | 🟡 | Banding is live and real. Notifications for it are seed rows, not generated. Periods hard-coded. No email/SMS/push |
| Tender → project conversion | `convert-to-project.tsx`, `lib/data/tenders.ts` | ✅ with bugs | Carries organisation, region, value, dates, LoA, PBG; records override reason. Bugs in section 5 |

### 2.3 Project fields

| Requirement | Status | Notes |
|---|---|---|
| Work order no./date, contract type, billing cycle, payment terms, value, dates, status, manager, GSTIN, service line, site, organisation, region | ✅ | In the type, add form, CSV and detail page |
| Progress and health (planned vs actual, RAG, overdue) | ✅ | List and Progress tab |
| BOQ | 🟡 | Read-only table; no editor or import; executed quantity is seeded/cached |
| Billing and payment | ✅ | Derived from invoices |
| Subcontractors per project | ✅ | |
| Edit / delete project | ❌ | Add-only |

### 2.4 Subcontractors

| Requirement | Status | Notes |
|---|---|---|
| Master: name, contact, phone, email, GSTIN, PAN, address, state, trade, status | ✅ | Add form, CSV, detail |
| Many projects per subcontractor | ✅ | Via work orders |
| Per-project assignment (trade, scope, value, dates, progress) | 🟡 | Assign form exists; detail table omits dates/billed/paid; progress cannot be edited |
| Bills, paid, balance, last payment | 🟡 | Read-only. **No bill-entry or payment-entry screen** |
| Documents | 🎭 | Seeded list only |
| Subcontractor dashboard | 🟡 | Three KPI tiles and an overdue banner on `/subcontractors`, plus dashboard tiles 6 and 7. By-trade and by-subcontractor breakdowns are computed but never rendered |

### 2.5 Employees and payroll

| Requirement | Status | Notes |
|---|---|---|
| Employee fields (code, name, phone, site, designation, department, joining, salary, advance, salary status) | ✅ | Directory, add form, CSV |
| Payslip (days, gross, advance, PF, ESI, other, net, status) | ✅ view | Read-only, seeded |
| Payroll dashboard (salary pending, PF status) | ✅ | `/employees/payroll/dashboard` |
| Run payroll, mark salary paid/on hold, record PF remittance | ❌ | No code writes payslips or payroll runs; "pending" can never change |
| PF/ESI rules | 🟡 | Rates are constants inside the seed generator, not in settings and not applied when adding an employee |
| Edit / delete employee | ❌ | Add-only |

### 2.6 GST and invoices

| Requirement | Status | Notes |
|---|---|---|
| Invoice fields (GSTIN, number, date, customer, taxable, CGST/SGST/IGST, total, payment and filing status, due dates) | ✅ | |
| New invoice form and CSV | ✅ | `modules/finance/entry.ts`: tax split, due dates, duplicate check |
| Record payment | ✅ | Rejects over-payment, sets PAID/PARTLY_PAID |
| Mark GST as filed / enter filing reference | ❌ | Filing status is read-only |
| GST dashboard | 🟡 | Per-GSTIN/month filing summary exists. The net-GST computation in `lib/data/gst.ts` is never rendered |
| Intra- vs inter-state split | ✅ | Plant-site state vs our GSTIN state; SGST takes the rounding remainder |

---

## 3. Coverage beyond the client brief (system-flow.md and CLAUDE.md)

| Area | Status | Evidence / notes |
|---|---|---|
| GO / NO-GO | 🎭 | Displayed from seeded decisions. No screen creates one; approving in the inbox does not write it back or move the stage |
| EMD tracking | 🟡 | Seeded instruments shown on tender detail, "EMD locked" rollup. No UI to arrange, refund or adjust |
| PBG tracking | 🟡 | Moves to the project on conversion. No create/extend UI |
| LoA / agreement | 🟡 | Display only; award conditions gate conversion |
| Approvals engine | 🟡 | Single-step inbox with comment (mandatory on reject) and timeline. No multi-level flows, no thresholds, no delegation. **Approving never updates the source record** (PO, bill, payroll run, tender). No self-approval guard. GO/NO-GO is not a request type |
| Daily work reports | ✅ (UI) | BOQ-linked entry, PM review, issues. Photos are only a count; no offline draft; "missing report" logic ignores each site's cutoff time |
| Attendance | 🟡 | Mark, grid, CSV, idempotency key. No leave/OT workflow, no transfer UI, no alerts |
| Payroll runs | 🎭 | Read-only, no approval link, lock or reason capture |
| Roles and permissions | 🟡 | Tables exist; `can()`/`canView()` are labelled UI-only. **Scope (own region/project/site) is never enforced on data**; most create/edit buttons are unchecked; roles are read-only in settings |
| Reporting hierarchy | ❌ | Not modelled anywhere |
| Notifications | 🟡 | Bell menu with read/unread and deep links. All rows are seeded; nothing creates one at runtime; no reminder settings or channels |
| Audit trail | 🎭 | Type and a read function exist. **Nothing ever writes an audit entry**; no before/after capture, no enforced reasons, no viewer page |
| Settings / configurability | 🟡 | Add-only stages, service lines, expense categories; roles/regions read-only. Not configurable: checklists, deduction types, project statuses, labour types, approval levels, reminder periods, payroll rules, GSTINs |
| BOQ | 🟡 | Read-only (see 2.3) |
| RA billing | 🟡 | Modelled as GST invoices; not built from BOQ × executed quantity, no cumulative-vs-this-bill, one deduction per form |
| Retention | 🟡 | Data and summary only. No withhold/release UI; new invoices create no retention entry |
| Deductions (department, TDS) | 🟡 | Deduction types are a table but unmanaged in settings; amounts typed manually; `defaultRate` unused |
| Purchases / vendors (Phase 5) | 🎭 | Types, seed and list functions only. No screens and no GRN/quotation entity |
| Site stock | ❌ | Type and seed only; no read code or UI |
| Soft delete | 🟡 | `deletedAt` exists and most reads filter it; no delete action exists. Some totals ignore it (section 5) |
| Tender → project carry-over | ✅ | Best-developed flow; documents, EMD adjustment and BOQ are not carried over |

### Hard-coded business rules that CLAUDE.md says must be configurable

| Rule | File |
|---|---|
| Dashboard variant chosen by comparing role-key strings | `components/dashboard/home.tsx` |
| GO/NO-GO and "submitted" logic keyed to stage `systemKey` strings | `lib/data/tenders.ts`, `tender-detail.tsx`, `urgency.ts` |
| Project status ids/keys (`pst_mobilisation`, `COMPLETED`, `IN_PROGRESS`) | `lib/data/tenders.ts`, `projects/page.tsx`, `modules/projects/entry.ts` |
| GST default 18%, rate range 0–40 | `finance/invoice-form.tsx`, `modules/finance/entry.ts` |
| Payment terms 30 days (three places), filing due on the 11th | `accounts.ts`, `dashboard13.ts`, `subcontractors/page.tsx`, `entry.ts` |
| PF 12%/₹15,000, ESI 0.75%/3.25%/₹21,000, professional tax | `seed/payroll.ts` |
| Project health thresholds (5% / 15%) | `lib/data/projects.ts` |
| Approval due = +2 days; approver rule by estimate | `modules/approvals/entry.ts`, `seed/tenders.ts` |
| Reminder bands 7/3/1 and alert windows | `lib/data/tenders.ts`, `seed/platform.ts` |
| Weekly off hard-coded to Sunday | `lib/data/sites.ts` |
| Default deduction type id `ded_tds_it` | `modules/finance/entry.ts`, `invoice-form.tsx` |
| Employee/project code formats (`SPH-…`) | `modules/workforce/entry.ts`, `lib/data/tenders.ts` |

---

## 4. Production-readiness checklist

### Data
| Item | Status | Evidence |
|---|---|---|
| Real database | **Missing** | No Prisma/DB; data is seed + browser `localStorage` |
| Schema and migrations | **Missing** | No `prisma/`; `docs/data-model-full.md` is a design document ("not yet built") and CLAUDE.md still points at the older name `docs/data-model.md` |
| Seed vs real data separation | **Partial** | Seed is deterministic and isolated, but it is the only data store; a seed-version bump wipes user edits |
| Backups | **Missing** | |
| Import from Excel | **Partial** | CSV import for tenders, projects, subcontractors, employees, attendance, invoices (`lib/csv.ts`, `components/data/import-export.tsx`); no `.xlsx` |
| Export to Excel/PDF | **Partial** | CSV export only; no PDF or `.xlsx` |

### Backend
| Item | Status | Evidence |
|---|---|---|
| API layer | **Missing** | No `route.ts`, no server actions |
| Server-side validation | **Missing** | Hand-written client-side builders in `modules/*/entry.ts`; no Zod |
| Transactions | **Missing** | |
| Error handling | **Partial** | Builders return error strings; no error boundaries (`error.tsx` absent) |
| Pagination | **Partial** | DataTable "show more" is client-side only |

### Auth & security
| Item | Status | Evidence |
|---|---|---|
| Real login, password policy/reset, sessions | **Missing** | Role switcher (`layout/role-switcher.tsx`) lets anyone become any user |
| Server-side permission checks with scopes | **Missing** | `lib/data/access.ts` is UI-only; scope never filters data; anyone can edit `localStorage` |
| Rate limiting, input sanitisation | **Missing** | |
| Secrets handling | **Partial** | `.env*` is gitignored but no `.env.example` exists |
| OWASP Top 10 | **Missing** | Broken access control and missing auth are the dominant risks; no `dangerouslySetInnerHTML` was found. No security headers in `next.config.ts` |
| File upload safety | **Missing** | Only a camera input on `daily-work/new`; files are held in memory and only a count is saved |
| Sensitive data (PAN, salary, UAN, bank) | **Missing** | PAN and salaries sit unencrypted in browser storage; the model also carries a `bank` field. No masking |
| DPDP Act considerations | **Missing** | No consent, retention or deletion workflow, no access enforcement. Must be solved before real employee data is loaded |

### Audit trail
| Item | Status | Evidence |
|---|---|---|
| Who/what/when/before-after/reason | **Missing** | `types/audit.ts` and `listAuditLogs` exist; **no code writes entries**; no viewer page |
| Append-only | **Missing** | Nothing prevents upserts to `auditLogs` |

### Files
| Item | Status | Evidence |
|---|---|---|
| Real document/photo storage | **Missing** | |
| Size limits, compression | **Missing** | |

### Notifications
| Item | Status | Evidence |
|---|---|---|
| In-app | **Partial** | Bell menu + seeded rows with read state (`notifications-menu.tsx`) |
| Email, WhatsApp/SMS | **Missing** | |
| Scheduled reminder jobs | **Missing** | Deadline bands are computed live in the UI, nothing generates stored notifications |

### Frontend quality
| Item | Status | Evidence |
|---|---|---|
| Responsiveness 360/768/1280 | **Partial** | DataTable switches to cards below `md`; bottom nav and drawer exist; 66 uses of 44px touch-target classes. **Not tested at widths in this audit** |
| Accessibility | **Partial** | Skip link, ~68 aria-labels, `aria-invalid`/`describedby` in RecordForm, AA token contrast verified by script. Only ~20 explicit `focus-visible` rules; not keyboard-tested |
| Loading/empty/error states | **Partial** | EmptyState used widely; few skeletons; **no `loading.tsx`/`error.tsx`/`not-found.tsx`** |
| Form validation | **Partial** | Required-field inline errors plus builder checks; no schema validation |
| Consistency with CLAUDE.md design rules | **Mostly done** | No raw hex in components, no gradients, tokens used. Minor: `shadow-xl` on chart tooltip, `text-white` on the LOST stepper. Emoji absence not confirmed |
| Filters remembered | **Missing** | Region and date persist; list filters (status, search, chips) are plain component state and are lost on navigation |

### Mobile / site use
| Item | Status | Evidence |
|---|---|---|
| PWA install | **Missing** | No manifest or service worker (only a theme-color meta and an icon) |
| Offline drafts | **Missing** | No draft code in `daily-work/new` |
| Slow-network behaviour | **Missing** | No network layer exists to degrade |
| Camera upload | **Partial** | `<input capture="environment">` present, no compression and nothing is stored |

### Testing
| Item | Status | Evidence |
|---|---|---|
| Unit / integration / e2e | **Missing** | No runner, no tests |
| Money logic coverage | **Missing** | Only seed invariants in `scripts/check-seed.ts` (invoice and payslip totals, tax-split rule, PF/ESI flags). Untested: `money.ts`, `buildInvoice`, rounding, ageing, date helpers, PF/ESI ceilings and rates, subcontractor balances, receivables |

### Code quality
| Item | Status | Evidence |
|---|---|---|
| TypeScript strictness / lint | **Done** | Typecheck and lint clean; zero `any`, `@ts-ignore`, `eslint-disable`, `console.*`, TODO/FIXME (agent grep) |
| Dead code | **Partial** | `/home`, `module-placeholder.tsx`, 4 unused UI files, ~40 unused data exports; stray scaffold folder `tender-crm/` on disk (untracked; excluded from lint/tsc), five unused default SVGs in `public/` |
| Duplicated logic | **Partial** | "Needs attention" is assembled in three places (`getAttentionItems`, `attention.tsx`, `command-centre.tsx`); duplicated form styling helpers |
| Hard-coded business rules | **Partial** | See section 3 |

### DevOps
| Item | Status | Evidence |
|---|---|---|
| Environments, CI/CD, hosting plan | **Missing** | No `.github`, no Dockerfile |
| Logging, monitoring, error tracking | **Missing** | |
| Performance budget | **Missing** | Not defined or measured |

### Docs
| Item | Status | Evidence |
|---|---|---|
| README / setup | **Partial** | `README.md` is a short run guide |
| Architecture docs | **Done** | `CLAUDE.md`, `docs/system-flow.md`, `docs/data-model-full.md`, `docs/client-profile.md` |
| User guide | **Missing** | |

---

## 5. Bugs and issues found

No broken page route was found, and the build is clean. Findings below are from code reading; items marked (verified) I confirmed myself.

| # | Severity | Issue | Location |
|---|---|---|---|
| B1 | High | **New invoices always get customer GSTIN "UNREGISTERED"** because seeded organisations have `gstin: null`, so UI-created and imported invoices would be filed as B2C in GSTR-1. Seeded invoices instead carry made-up GSTINs with an invalid checksum | `modules/finance/entry.ts:103` (verified), `seed/org.ts`, `seed/accounts.ts` |
| B2 | High | **No audit entries are ever written**, contradicting architecture principle 4 | whole app |
| B3 | High | **Approving a request never changes the underlying record**, so approvals have no effect | `approvals-inbox.tsx` |
| B4 | Med | Invoice number can exceed the GST 16-character limit (seed format is 19 chars and new numbers inherit it); FY sequence never resets; "latest" chosen by string sort | `modules/finance/entry.ts:46-52`, `seed/accounts.ts:116` |
| B5 | Med | Impossible dates (e.g. 2026-02-30) accepted as invoice dates (`Date.parse` rolls over; verified on Node 24). Invoice import rejects DD-MM-YYYY while other importers accept it | `modules/finance/entry.ts:28` (verified) |
| B6 | Med | Invoice form lets the user pick any of the four GSTINs, defaults ignore the project's GSTIN, so a wrong-state split is possible | `finance/invoice-form.tsx` |
| B7 | Med | Retention and GST-TDS deductions on new invoices create no retention entry or TDS GST transaction, so retention and net-GST summaries are understated/overstated | `modules/finance/entry.ts:123`, `lib/data/gst.ts:48` |
| B8 | Med | Dashboard and finance links pass `overdue`, `ageing`, `customer` (finance) and `stage` (tenders) filters that no screen reads, so drill-downs land on unfiltered lists. `/projects?focus=` after tender conversion is also ignored, so "Open project" shows the plain list instead of the new project. The overdue link was added by the new dashboard | `dashboard/charts.tsx`, `command-centre.tsx`, `attention.tsx`, `convert-to-project.tsx:26` (focus verified) |
| B9 | Med | Ageing is defined two ways (days since invoice on Finance vs days past due on the dashboard), so bucket totals differ between screens | `finance/receivables.tsx`, `dashboard13.ts:391` |
| B10 | Med | "Payable"/"balance" for subcontractors uses four different status filters; a rejected bill inflates assignment balance; vendor invoices awaiting approval count as payable while sub-bills do not | `lib/data/parties.ts`, `dashboard13.ts`, `accounts.ts` |
| B11 | Med | Soft-deleted invoices/bills still count in project billing, GST summary and payables | `accounts.ts:68-131`, `gst.ts:12-18` |
| B12 | Med | Advance recovery in payslips is random and never reduces the advance balance, so "advance outstanding" is overstated | `seed/payroll.ts:50`, `workforce.ts:131` |
| B13 | Med | PF wages use gross incl. overtime (should be basic+DA); employer share is a flat 12% instead of 3.67% EPF + 8.33% EPS + admin + EDLI; PF "Remitted" means "payroll locked", not a payment; no ESI status/due tracking; professional tax is a flat ₹200 for every state | `seed/payroll.ts`, `dashboard13.ts:322` |
| B14 | Med | Payslip days and overtime are random, not derived from attendance; proration rounds the percentage to 2 decimals (up to ~₹0.75 error); joiners/leavers still get payslips | `seed/payroll.ts:43` |
| B15 | Med | Employee builder uses `Number().toFixed(2)` for money, accepting `1e3` and `0x10`; new employees are not auto-flagged for ESI | `modules/workforce/entry.ts:48-104` |
| B16 | Med | Projects created from UI-created tenders get an empty GSTIN; project code is `count + 1` and can collide; manager is null | `lib/data/tenders.ts` `buildConversion` |
| B17 | Med | Sub-bill GST uses subcontractor vs project state while recording the project's GSTIN; GSTIN state code and PAN are not validated; duplicates only checked by name | `seed/parties.ts`, `modules/subcontractors/entry.ts:34-45` |
| B18 | Low | CGST/SGST can differ by 1 paisa (CGST rounded, SGST takes remainder); statute requires equality | `modules/finance/entry.ts:91,111` |
| B19 | Low | `toPaise` throws on malformed input so `formatINR(NaN)` can crash a render; `formatINR` compact rounds after choosing the unit (₹99,999,999.99 shows "₹100.00 L") | `lib/money.ts` |
| B20 | Low | Outstanding not clamped; over-receipt hides an invoice from receivables; `Number()` comparisons used for money | `accounts.ts:36-52` |
| B21 | Low | `useUrlParam` is read-only and does not re-render on same-page query changes; list filters are not remembered | `lib/use-url-param.ts` |
| B22 | Low | `/home` duplicates `/dashboard`; `entityHref` sends purchase types to `/daily-work`; tenders detail route does not `decodeURIComponent` its id | `app/home`, `lib/data/links.ts`, `tenders/[id]/page.tsx` |
| B23 | Low | "Missing report" logic ignores site cutoff time; attendance "not marked" counts assignments not employees; HOLIDAY not treated like WEEKOFF | `lib/data/sites.ts:69`, `workforce.ts:60` |
| B24 | Low | Dashboard "Employees" counts directors while payroll "On payroll" excludes zero-wage staff; project "Billed" is incl. GST while dashboard "billed" is taxable value | various |
| B25 | Info | Records created in the browser have ids outside each detail route's `generateStaticParams`; whether their detail page opens (with `cacheComponents` on) was **not tested** | `app/*/[id]/page.tsx` |
| B26 | Info | Demo clock is frozen at 2026-10-07 while `createdAt` uses the real clock | `lib/dates.ts` |

---

## 6. Prioritised gap list

Effort: S ≤ 2 days, M ≈ 1–2 weeks, L > 2 weeks (one developer, rough).

| Pri | Gap | Effort | Order |
|---|---|---|---|
| P0 | Real backend: PostgreSQL + Prisma schema and migrations from `data-model-full.md`, seed vs real data separated | L | 1 |
| P0 | Authentication (Auth.js), sessions, password reset; remove the role switcher from production | M | 2 |
| P0 | Server-side `can(user, permission, scope)` on every route/action; enforce region/project/site scope | M | 3 |
| P0 | API/service layer with Zod validation and transactions; move `modules/*/entry.ts` rules server-side | L | 4 |
| P0 | Audit log writes in the same transaction, with before/after and mandatory reasons on amounts, approvals, results, payroll | M | 5 |
| P0 | Money-logic unit tests (Vitest): `money.ts`, invoice GST split and rounding, ageing, PF/ESI/PT, net salary, subcontractor balances, dates | M | start with step 1, run alongside |
| P0 | Fix B1 (customer GSTIN), B4/B5 (invoice number and dates), B6, B7, B15 before any invoice leaves the system | S–M | 6 |
| P0 | Protect sensitive data (PAN, salaries, bank): server-side storage, access control, masking; DPDP basics (consent, retention, deletion) | M | with auth |
| P0 | Deploy basics: environments, CI (lint, typecheck, test, build), hosting, backups, error tracking, `.env.example` | M | before go-live |
| P1 | Make workflows real: tender stage transitions, GO/NO-GO, bid, result, EMD/PBG actions; approvals writing back to source records (B3) | L | 7 |
| P1 | Payroll engine and runs: attendance-driven days/OT, statutory PF split, ESI, state PT slabs, advance recovery, mark paid/on hold, PF/ESI remittance records | L | 8 |
| P1 | Subcontractor bill and payment entry; one definition of "payable" (B10); retention withhold/release; TDS by PAN type | M | 9 |
| P1 | GST: mark filed/enter reference, GSTR-1/3B period view, net liability, ITC (use the unused `getGstSummary`) | M | 10 |
| P1 | Real files: S3 storage, upload limits, photo compression, document checklist uploads | M | 11 |
| P1 | Notification engine: scheduled jobs for deadline/EMD/PBG/PF reminders, email and WhatsApp/SMS | M | 12 |
| P1 | PWA for site staff: manifest, service worker, offline drafts, camera flow | M | 13 |
| P1 | Edit and soft-delete for tenders, projects, employees, subcontractors; honour `deletedAt` in every total (B11) | M | 14 |
| P1 | Add `loading.tsx`, `error.tsx`, `not-found.tsx`; make dead drill-downs live (B8); persist list filters in the URL (B21); align ageing (B9) | S | quick wins, do early |
| P1 | Playwright e2e on desktop and a 360px viewport; integration tests for permissions and tender→project | M | after 7 |
| P2 | Settings editors: checklists, deduction types, project statuses, reminder periods, approval levels, payroll rules, GSTINs; remove role-key comparisons from `home.tsx` | L | 15 |
| P2 | Reporting hierarchy and multi-level approvals | M | 16 |
| P2 | Purchases/vendors screens (site request → PO → GRN → invoice → payment), site stock | L | 17 |
| P2 | RA bills built from BOQ × executed quantity with cumulative tracking; BOQ editor/import | L | 18 |
| P2 | Excel (`.xlsx`) and PDF export/import | M | 19 |
| P2 | Cleanup: remove `/home`, unused UI files, `tender-crm/` folder, default SVGs; merge the three attention builders; add `tailwind-merge`; move `shadcn` and `tsx` to dev dependencies | S | anytime |
| P2 | Accessibility and responsive pass at 360/768/1280/1440 with keyboard testing; user guide; performance budget | M | before go-live |

---

## 7. Summary

**Distance from production.** This is a polished, well-structured front-end prototype, not a system that can hold real business data. Lint, typecheck and build are clean, the design rules in CLAUDE.md are largely followed, the 13 client dashboard items are populated, and money arithmetic is done safely in integer paise. But there is no backend, no login, no database, no tests and no deployment, and the browser's local storage is the only data store. Realistically the backend, auth, permissions and audit layer are the bulk of the remaining work, and the workflows after "register" (stage changes, approvals acting on records, payroll runs, bill and payment entry, GST filing) are mostly display-only today. A reasonable estimate is that the visible UI is well over half done, while the functional product (what happens when someone presses a button) is closer to a quarter. Treat that as a judgement, not a measurement.

**Top 10 gaps**
1. No database or backend; all data lives in the browser.
2. No real authentication; anyone can switch to any role.
3. Permissions and scopes are UI-only and never applied to data.
4. No audit trail is ever written.
5. No automated tests, including for GST, PF/ESI and balances.
6. Approvals don't change the records they approve, and tenders can't move through their stages.
7. No payroll engine; PF/ESI logic is simplified and lives in the seed generator.
8. Invoice creation produces unsafe GST data (UNREGISTERED customer GSTIN, invalid number lengths, impossible dates).
9. No file storage, PWA/offline support, or notification delivery (email/WhatsApp).
10. No CI/CD, hosting, backups, monitoring or error tracking.

**Biggest risks**
- **Compliance:** personal and financial data (PAN, salaries) in unencrypted browser storage with no DPDP controls; incorrect GST/PF/ESI outputs if the seed-based logic is trusted as-is.
- **Trust in the numbers:** several screens define the same figure differently (ageing, subcontractor payable, billed), and soft-deleted rows leak into totals. A director could see two different answers on two screens.
- **Scope perception:** because screens look finished, stakeholders may assume workflows work. Many are display-only, including status changes and approvals.
- **Missing requirement source:** the client PDF isn't in the repo, so the "complete" claim for client requirements can't be verified independently.
- **Untested at runtime:** responsiveness, accessibility, console errors and the open-detail-page-for-new-records behaviour were not exercised in a browser in this audit.
