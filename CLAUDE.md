# CLAUDE.md — S. Prince Management Tool

Guidance for Claude Code when working in this repository.

## Project

**S. Prince Management Tool** is the CRM/ERP for **S. Prince Hightech Pvt. Ltd.**, an industrial services contractor for thermal power plants and the steel industry. Customers are power utilities and PSUs (NTPC, CSPGCL, MSPGCL, DVC, MPPGCL, KPCL, TANGEDCO, IOCL, NALCO). Work is done at named plant sites in four operating regions — **Chhattisgarh, Maharashtra, South, Delhi** — from a registered office in Mumbai and a branch in Chennai. It connects the full lifecycle:

**Tender → Project → Site work → Workforce → Purchases/Subcontractors → Billing → GST/EPF/Accounts → Director Dashboard**

**Client scope takes priority.** The client's official requirements (`docs/client-requirements.pdf`, when present) override `docs/system-flow.md` wherever they differ. What has been applied so far from the client brief is recorded in **`docs/client-profile.md`**. The generic business flow is in **`docs/system-flow.md`**. Read it before starting any module. The data model lives in **`docs/data-model.md`** (create/update it before schema changes).

## Product Priorities (in order)

1. **Mobile responsive, always.** Every screen must work fully on a phone (360px wide) as well as desktop. No screen ships until it has been checked at mobile, tablet and desktop widths. Responsiveness is a requirement, not a polish step.
2. **User experience first.** Users should understand in seconds **what needs attention, what is pending, and what action to take**. Fewer clicks, clear next steps, no dead ends.
3. **Impressive, insightful UI** — clear charts and graphs that turn data into decisions, presented in a calm, mature, professional style (see UI/UX Design Guidelines).
4. Correctness of business, money and compliance logic.

## Tech Stack

- **Next.js (App Router) + TypeScript** (strict mode) — UI and API in one app
- **PostgreSQL + Prisma** — database and migrations
- **Auth.js** — authentication; authorisation is our own role/permission tables
- **Tailwind CSS + shadcn/ui** — UI components, themed with the design tokens below
- **Recharts** (via shadcn/ui charts) — graphs and charts
- **lucide-react** — icons (thin, consistent stroke)
- **Inter** (via `next/font`) — primary font
- **Zod** — validation for every API input and form
- **S3-compatible storage** — tender documents, site photos
- **Background jobs** — reminders/notifications (scheduler to be chosen in Phase 0)
- **Vitest** (unit/integration) + **Playwright** (critical flows, including mobile viewports)
- **PWA** — site-staff screens installable on phones

## Commands

> Front-end MVP (mock data, no backend/auth yet): the scripts below marked ✔ exist today; the rest arrive with the backend phases.

```bash
npm run dev          # ✔ start dev server
npm run build        # ✔ production build
npm run lint         # ✔ eslint
npm run typecheck    # ✔ tsc --noEmit
npm run seed:check   # ✔ audit the mock seed against the client's field lists and the 13 dashboard items (uses npx tsx)
npm run contrast:check # ✔ WCAG AA check of every design-token colour pair (uses npx tsx)
npm test             # vitest
npm run test:e2e     # playwright (desktop + mobile projects)
npx prisma migrate dev --name <change>   # create & apply migration
npx prisma db seed   # load seed data
```

## UI/UX Design Guidelines

### Overall feel
**Mature, minimal, professional enterprise CRM.** Premium, trustworthy, precise. Clean and calm — not flashy and not overly "SaaS-like".

### Colour palette
Define these as CSS variables / Tailwind theme tokens and use **only tokens**, never raw hex values in components.

| Token | Value | Use |
|---|---|---|
| `background` | `#F8F8F7` | App background |
| `surface` | `#FFFFFF` | Panels, tables, sidebar, dialogs |
| `text` | `#171717` | Primary text |
| `text-secondary` | `#6B6B6B` | Labels, meta, helper text (AA on background, surface and accent-subtle) |
| `border` | `#E5E5E5` | Thin dividers and outlines |
| `accent` | `#F2B800` | **Fill only** (the S. Prince logo yellow): primary buttons, active-nav indicator, primary chart series, selected states |
| `accent-foreground` | `#171717` | Text/icons on `accent`. **Never white text on yellow** |
| `accent-strong` | `#856000` | Dark amber for links, icons, focus rings and any yellow-family text on white (≥ 4.5:1) |
| `accent-subtle` | `#FDF6E3` | Very light yellow: active nav background, row highlights, hover |

Status colours — **muted, used only for status indicators** (badges, health dots, alert markers), never for decoration:

| Token | Meaning |
|---|---|
| `status-success` | On track / approved / paid (muted green) |
| `status-warning` | At risk / pending / due soon (muted orange) |
| `status-danger` | Delayed / rejected / overdue (muted red) |
| `status-neutral` | Draft / inactive (grey) |

Rules:
- Mostly neutrals with **one yellow accent** (the S. Prince logo yellow). Yellow is a *fill*: never use it for text or icons on white (it fails contrast) — use `accent-strong` for that, and `accent-foreground` (dark) on top of yellow.
- Use colour sparingly — only for actions and status. `status-warning` is a muted **orange** so it is never confused with the yellow accent.
- **Contrast is checked, not eyeballed:** run `npm run contrast:check` after changing any token. Every text pair must reach 4.5:1 and every icon/indicator/chart series 3:1. The yellow fill alone is 1.8:1 on white, so it always carries a dark label, and chart bars in `accent` get a 1px `accent-strong` outline.
- **Avoid:** gradients, glassmorphism, heavy or stacked shadows, 3D effects, decorative illustrations, unnecessary colours.
- Elevation comes from thin `border` lines and whitespace; at most a very subtle shadow on popovers/dialogs.
- Status must never rely on colour alone — pair with a label or icon.

### Typography
- **Inter** for everything; tabular numerals (`font-variant-numeric: tabular-nums`) for all amounts, quantities and table columns of numbers.
- Clear hierarchy with few sizes: page title, section title, body, small/meta. Use weight and `text-secondary` rather than many sizes or colours.
- Amounts right-aligned in tables.

### Layout & components
- Prefer **whitespace, thin borders, clean typography, tables, timelines and clear hierarchy** over piles of cards. Use cards only for genuinely separate summary items (e.g. KPI tiles).
- **Information-dense but uncluttered**: compact table rows on desktop, generous spacing between sections.
- **Sidebar:** white surface, thin right border, grouped navigation, **subtle yellow active state** (`accent-subtle` background, a `accent` left indicator, dark text, `accent-strong` icon). Collapsible on desktop; becomes a drawer on mobile.
- **Timelines** for tender stages, approval history and audit trail.
- **Page header pattern:** title, key status badge, primary action on the right, secondary actions in a menu.
- **Empty states:** one line explaining what goes here and a single clear action.
- Rounded corners small and consistent (e.g. 6–8px). Focus rings in `accent-strong`, always visible for keyboard users.

### Charts & graphs
Charts should make the dashboard genuinely useful and look polished — but stay calm.
- Primary series in `accent` yellow (with a 1px `accent-strong` outline); additional series `chart-2…5` (dark/mid amber and greys, each ≥ 3:1 on white); status colours only when the data *is* status (e.g. Green/Amber/Red project health).
- No 3D, no gradients, no heavy animation (a short, subtle entry transition is fine). Light gridlines in `border`, axis labels in `text-secondary`.
- Every chart has a title, clear units (₹ Cr / ₹ L / %, days), INR-formatted tooltips, and a sensible empty state.
- Prefer simple, readable types: bar, line/area (flat fill), stacked bar, donut for composition, progress bars, funnels for the tender pipeline, sparklines in KPI tiles.
- Charts must be **responsive**: resize to their container, reduce tick density on small screens, and remain readable at 360px (stack legends below the chart on mobile).
- Clicking a chart segment should drill down to the filtered list where it makes sense (e.g. "Delayed projects" bar → list of delayed projects).

Suggested dashboard visuals:
- Tender pipeline by stage (funnel / horizontal bar), win rate, value won vs lost
- Upcoming tender deadlines (timeline list with days-left badges)
- Project progress (planned vs actual), project health distribution
- Money: receivables vs payables, EMD/PBG locked, collections over time, budget vs actual per project
- Site activity: daily manpower trend, missing daily reports
- Region filter applied to all widgets

### Usability principles
- Every screen answers: **What needs my attention? What's pending? What do I do next?**
- Dashboards lead with an **"Attention" area**: overdue items, pending approvals assigned to me, upcoming deadlines — each with a direct action.
- Show status with consistent badges everywhere (same label + colour for the same state across modules).
- Primary action always obvious and in a consistent place; destructive actions secondary and confirmed.
- Inline validation, helpful error messages, optimistic feedback with toasts for success.
- Keep forms short: smart defaults, carry-over data (tender → project), progressive disclosure for advanced fields.
- Search and filters (region / status / date range) on every list; remember the user's last filters.
- Loading states use skeletons, not spinners covering the page.
- Accessibility: WCAG AA contrast, keyboard navigable, labelled inputs, touch targets ≥ 44px.

### Responsive strategy
**All screens are mobile responsive.** Within that, optimise per audience:
- **Management/office screens** (dashboard, tenders, accounts, reports): designed desktop-first for density, then adapted so they remain fully usable on mobile — directors will check the dashboard on their phones.
  - KPI tiles reflow to 2 columns then 1.
  - Wide tables become stacked row cards on mobile, showing the most important fields + status, with a tap-through to details. Never force horizontal page scrolling (a scrollable table container is acceptable only for genuinely wide financial grids).
  - Charts resize and simplify.
- **Site-staff workflows** (daily work report, attendance, photo upload, site requests): **mobile-first**.
  - Large touch targets, single-column forms, sticky bottom action button, camera-first photo capture with compression.
  - Bottom navigation on mobile for site roles.
  - Works on slow 3G; small payloads; drafts saved locally so nothing is lost if the connection drops.
- Test breakpoints: **360px, 768px, 1280px, 1440px**.

## Domain Glossary

| Term | Meaning |
|---|---|
| CHP | Coal Handling Plant — where stone picking from running conveyors is done |
| Service line | What the company sells: Stone Picking (manpower), Industrial Painting & Coating, Cast Basalt Pipeline, Steel Structure EPC, Civil Works, Scaffolding (configurable list) |
| Service contract | Multi-year contract billed monthly (e.g. stone picking manpower), versus a fixed-scope job billed on milestones |
| Man-day | Unit for manpower contracts; other units are sq m, running metres and MT |
| Plant site | A named customer power plant or refinery where work is done, e.g. NTPC Korba |
| Tender | Government invitation to bid for a works contract |
| Bid | Our offer: quoted amount + documents |
| EMD | Earnest Money Deposit — security paid to participate; refunded or adjusted |
| GO / NO-GO | Management decision whether to participate in a tender |
| L1 | Lowest financial bidder |
| LoA | Letter of Acceptance (award) |
| PBG | Performance Bank Guarantee — security after award |
| BOQ | Bill of Quantities — work items × quantity × rate |
| RA bill | Running Account bill — periodic bill to the department on measured work |
| Retention / SD | Amount withheld from bills, released later |
| GSTIN | GST registration number — one per state |
| TDS | Tax deducted at source (income tax TDS and GST TDS are different) |
| EPF | Employees' Provident Fund |
| Subcontractor | External party executing part of the work; can work on many projects |

## Architecture Principles (non-negotiable)

1. **Enter once, reuse everywhere.** A won tender converts into a project carrying client, region, GSTIN, value, dates and documents. Never ask the user to retype data that exists.
2. **Configurable, not hard-coded.** Tender stages, document checklists, roles, permissions, hierarchy, approval levels, reminder periods, statuses, expense categories, payroll rules and deduction types live in **settings tables**. If you are about to write an `enum` or `if (role === 'DIRECTOR')` for a business rule, stop and use configuration instead. TypeScript enums are fine only for truly fixed technical states.
3. **Every action is permission-checked on the server.** Use the central `can(user, permission, scope)` helper. Never rely on hiding buttons in the UI. Permissions are scoped: all / own region / own project / own site.
4. **Audit everything important.** Create/update/delete on business entities writes to the audit log (user, action, entity, before, after, reason, timestamp). Changes to amounts, approvals, tender results and payroll **require a reason**. Audit records are append-only.
5. **One generic approval engine.** GO/NO-GO, purchases, subcontractor bills, payroll runs etc. all use the same approval workflow model — don't build per-module approval logic.
6. **Everything ties to a project/site and a GSTIN** where money or work is involved.
7. **Soft delete** business records (`deletedAt`). Never hard-delete financial data.

## Conventions

### Money & numbers
- Store money as **`Decimal(14,2)`** in Prisma; never JS `number` floats for currency. Use a decimal library for arithmetic.
- Display in INR with Indian grouping: `₹2,40,00,000`, and compact `₹2.40 Cr` / `₹4.80 L` in KPIs and charts. Use the shared `formatINR` helper.
- Percentages stored as `Decimal(7,4)`.

### Dates
- Store timestamps in **UTC**; display in **Asia/Kolkata (IST)**.
- Display format **DD-MM-YYYY**; relative labels for deadlines ("in 3 days", "2 days overdue"). Use the shared date helpers.
- Pure dates (tender deadline day, attendance date) use a date-only column.

### Code structure
```
src/
  app/                 # Next.js routes (UI + route handlers)
  modules/<module>/    # domain logic per module: service, schema (zod), queries
  components/ui/       # shadcn components (themed with design tokens)
  components/charts/   # shared chart wrappers (consistent styling, formatting, empty states)
  components/layout/   # sidebar, mobile drawer, bottom nav, page header
  components/<area>/   # shared feature components (status badge, timeline, data table)
  lib/                 # auth, permissions, audit, approvals, money, dates, storage
  styles/              # design tokens
prisma/
  schema.prisma
  seed.ts
docs/
```
- Business logic lives in `modules/*/service.ts`, not in route handlers or React components.
- Route handlers / server actions: validate with Zod → check permission → call service → return.
- Services that change data run in a transaction and write the audit entry in the same transaction.
- Build reusable UI primitives once (`DataTable` with responsive card mode, `StatusBadge`, `Timeline`, `KpiTile`, `ChartCard`, `PageHeader`, `EmptyState`) and use them everywhere for consistency.
- Names: models in PascalCase singular (`Tender`, `Project`, `SubcontractorBill`); fields camelCase.

### Testing
- Unit tests are **mandatory** for money logic: EMD, bill deductions, retention, TDS, payroll, EPF, GST totals, outstanding balances.
- Integration tests for permission checks and the tender → project conversion.
- Playwright for: register tender → GO → submit → win → convert to project → daily report — run on **both desktop and a mobile viewport**.
- Visual check of every new screen at 360px, 768px and 1280px before calling it done.

### Seed data
Seed the four regions and offices, a GSTIN per office state, default roles/permissions, the six tender stages (New, Under Evaluation, Bid Preparing, Submitted, Won, Lost), the document checklist and the six service lines — plus the client's example: a **₹50 L project (KPCL Raichur) with Civil, Stone Picking and Painting subcontractors** — and enough tenders, plant-site projects (multi-year monthly-billed service contracts and fixed-scope jobs), about 150 employees and GST invoices that the dashboard charts look realistic. Seed data is deterministic (see `npm run seed:check`).

## How to Work in This Repo

- **Plan before coding** any module or schema change: list model changes, routes, screens (desktop + mobile layout) and tests, and wait for approval.
- **Schema first.** Update `docs/data-model.md` and `prisma/schema.prisma` together; create a named migration. Never edit an applied migration.
- Work in **vertical slices**: schema → service → API → UI (responsive) → tests for one feature, then commit.
- Follow the UI/UX Design Guidelines on every screen; don't introduce new colours, fonts or one-off styles — extend the tokens or shared components instead.
- Run `lint`, `typecheck` and `test` before saying a task is done.
- If a business rule is unclear or conflicts with `docs/system-flow.md`, **ask** — don't guess. Add it to the open questions list in that doc.
- Don't add new dependencies without saying why.
- Never commit secrets; use `.env` (with `.env.example` kept up to date).

## Build Phases

- [ ] **Phase 0 — Foundation:** scaffold, design tokens + Inter, app shell (sidebar, mobile drawer, bottom nav, page header), shared UI primitives and chart wrappers, auth, users, roles/permissions (scoped), regions/offices/GSTINs, reporting hierarchy, approval engine, audit log, document storage, notifications (in-app), settings/masters
- [ ] **Phase 1 — Tenders:** registration, configurable stages, GO/NO-GO, document checklist, EMD, bid & L1, result, LoA/PBG/agreement, convert to project, stage timeline
- [ ] **Phase 2 — Projects & Daily Work:** project overview, sites, BOQ, team, work allocation, mobile-first daily report with photos, health status
- [ ] **Phase 3 — Director Dashboard v1:** attention area, tender pipeline, project health and progress charts, money overview, alerts, approvals (extended in later phases)
- [ ] **Phase 4 — Subcontractors:** master, project assignments, work orders, bills, deductions, approvals, payments, outstanding
- [ ] **Phase 5 — Purchases & Vendors:** site request (mobile) → approval → quotation → PO → GRN → invoice → payment; simple site stock
- [ ] **Phase 6 — Attendance & Payroll:** mobile site attendance, transfers, OT/leave, labour types, payroll runs, EPF calc & export
- [ ] **Phase 7 — Accounts, RA Billing & GST:** RA bills with department deductions, receipts, receivables/payables, GST reports per GSTIN
- [ ] **Phase 8 — Hardening:** reports, full notification set, performance, accessibility pass, backups, security review

Tick phases off as they are completed.
