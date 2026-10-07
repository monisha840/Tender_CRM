# S. Prince Management Tool: Production Roadmap

Built from `docs/audit-report.md` (code audit, 07-10-2026) and `docs/research-report.md` (business research). Use this file as the plan, and the prompts in section 5 to build it with Claude Code agents.

---

## 1. Verdict

The app is a **polished front-end prototype**. Lint, typecheck and build pass, the design rules are followed, all 13 dashboard items are populated, and money is calculated safely in paise.

It is **not production-ready**. There is no database, backend, login, permissions on data, audit trail, tests or deployment. Most workflows after "add" are display-only. Tenders can't change stage. Approvals don't change the record they approve. Payroll, subcontractor bills and GST filing can't be updated.

The audit's own estimate: UI more than half done, working product about a quarter done.

**Realistic timeline:** with parallel agents and you reviewing each wave, plan on roughly **4–6 weeks to a pilot**, run on one site with real data. Full production comes **after 2–4 weeks of pilot use** with S. Prince staff. Treat this as an estimate. Your review speed and the client's answers to section 3 decide it.

---

## 2. What is missing

The audit covers the code. The research adds the business capabilities a PSU contractor needs.

### 2.1 Platform (the audit's P0s)

| Missing | Why it matters |
|---|---|
| PostgreSQL + Prisma schema, migrations, real seed | All data is in browser storage today and is lost or editable by anyone |
| Real login (Auth.js), sessions, password reset | Today anyone can become any user through the role switcher |
| Server-side permissions with region/project/site scope | Permissions exist in the UI only |
| API/service layer with Zod validation and transactions | No server layer exists |
| Audit trail (before/after, reason) | Nothing is ever written to it |
| Tests (Vitest + Playwright) | No test runner and no tests, including for GST, PF/ESI and salary |
| File storage (S3), upload limits, photo compression | Photos and documents are not stored |
| Notification engine (scheduled jobs, email, WhatsApp) | All notifications are seed rows |
| Sensitive data protection and DPDP Act basics | PAN and salaries sit unencrypted in the browser |
| CI/CD, environments, hosting, backups, monitoring | None exist |
| Loading, error and not-found pages | None exist |
| PWA and offline for site staff | No manifest, service worker or drafts |

### 2.2 Workflows that look done but aren't (audit)

- Tender stage changes, GO/NO-GO decisions, bid, result, EMD and PBG actions.
- Approvals that write back to the source record; multi-level approvals and thresholds.
- Payroll runs: days and overtime from attendance, correct PF split, ESI, state professional tax, advance recovery, mark paid/on hold, PF/ESI remittance records.
- Subcontractor bill and payment entry, retention withhold/release, TDS.
- GST: mark as filed with a reference, return-period view, net liability.
- Editing and soft-deleting tenders, projects, employees and subcontractors.
- Settings editors for checklists, deduction types, statuses, reminder periods, approval levels, payroll rules and GSTINs. Thirteen hard-coded business rules need moving into settings.

### 2.3 Bugs to fix (audit B1–B26, grouped)

- **GST data errors:** customer GSTIN always "UNREGISTERED" (B1), invoice numbers over 16 characters and no yearly reset (B4), impossible dates accepted (B5), wrong GSTIN selectable (B6), CGST and SGST differing by a paisa (B18), subcontractor GST state and missing PAN/GSTIN validation (B17).
- **Numbers that disagree between screens:** receivables ageing (B9), subcontractor payable (B10), soft-deleted rows counted in totals (B11), billed incl. vs excl. GST and employee counts (B24).
- **Payroll logic:** advance recovery (B12), PF wage base and employer split (B13), payslips not driven by attendance (B14), unsafe money parsing (B15).
- **Dead links:** dashboard and finance drill-downs ignore their filters, and "Open project" after conversion lands on the list (B8, B21, B22).
- **Other:** project GSTIN and code on conversion (B16), retention and GST-TDS not recorded (B7), money formatting edge cases (B19, B20), site cutoff and holidays (B23), new-record detail pages untested (B25), demo clock (B26).

### 2.4 Business capabilities from the research (not in the app)

**P0 (go-live blockers):**
- The **work order as the hub**, with clause attributes: tax basis, escalation type, billing cycle, LD/penalties, PBG/SD/retention terms, defect liability period, subletting.
- An **expanded tender state machine** with multiple dates and corrigendum versions.
- A **document vault** that checks validity against each tender's due date.
- An **LoA → task chain → convert to contract** flow, including the 15-day Shram Suvidha intimation.
- A **financial-instrument ledger** for EMD, PBG, SD and retention.
- A **dated statutory rules engine**, so rate changes are data entries, not code releases.
- A **contract-labour payroll engine** producing ECR and bank payout files, with the 7-day wage countdown.
- **Worker onboarding** with document expiries.
- A **monthly bill-readiness check** per work order.
- A **bill lifecycle** that mirrors PSU portal stages, with **draft bill vs tax invoice** kept separate.
- **Receipt allocation** to each deduction.
- A **subcontractor compliance gate**.
- **Maker-checker approvals**.
- An **immutable audit trail**.
- **Multi-GSTIN** structure.
- **Import/export and Tally integration.**

**P1 (differentiators):**
- PSU gate/CLIMS reconciliation.
- Offline gang attendance.
- Shift roster and fill rate.
- Joint measurement (JMR) records.
- Hindrance and extension-of-time records.
- Change-in-law claims.
- Tax reconciliations (GSTR-7, TDS).
- MSME payment clock.
- Contract P&L and cash-flow forecast.
- Credentials library and PQ calculator.
- Manpower rate analysis.
- Safety module.
- Licence register.
- No-code workflow builder.

**P2 (intelligence):**
- Tender discovery import.
- Competitor analytics.
- Bid pricing from own costs.
- Prediction of held bills.
- Director copilot.
- Workforce takeover.
- WhatsApp payslips.
- Regulatory watch.
- Close-out cockpit.

---

## 3. Decide before building

The agents need these answers. Defaults are in brackets.

1. **Hosting:** where it runs. [Managed PostgreSQL and S3 storage in an India region (Mumbai), app on a managed Node host]
2. **Login:** email + password for office staff; how site supervisors log in. [Phone OTP later; username + password for the pilot]
3. **Notifications:** email provider and WhatsApp Business API provider. [Email first; WhatsApp in a later wave]
4. **Background jobs:** [pg-boss, a Postgres-based job queue, so no extra infrastructure]
5. **Client inputs:** real NTPC/CSPGCL/MSPGCL contract clauses, MSME (Udyam) category, whether state gencos have portals like NTPC's CLIMS, Tally version and usage, actual payroll rules (PF on basic+DA, state PT slabs).
6. **Put `docs/client-requirements.pdf` in the repo.** The audit could not find it, so client coverage was checked against other files.

---

## 4. Build plan (waves)

| Wave | Agents | Contents | Depends on |
|---|---|---|---|
| **A: Quick fixes + tests** | 1 | Bug fixes on the current app, missing pages, dead links, consistent figures, money unit tests, cleanup | nothing; start now |
| **B1: Data foundation** | 1 | Work-order-centric Prisma schema for all P0 entities, Postgres, migrations, seed, rules-engine tables | A merged |
| **B2: Platform core** | 1 | Auth, server-side permissions with scope, service-layer pattern, audit log, approval engine, notification engine, file storage, CI; **Tenders migrated end to end as the reference module** | B1 |
| **C: Modules** | 4 in parallel | C1 Tenders depth, C2 Contracts + Subcontractors, C3 Workforce + Payroll, C4 Billing + Finance | B2 |
| **D: Dashboard, settings, hardening** | 1, then 1 | Dashboard re-based on real data, settings editors, security, DPDP, e2e tests, deployment, pilot readiness | C merged |
| **E: Differentiators** | parallel | P1/P2 features, after the pilot starts | D |

Rules that keep parallel agents safe:
- **Waves A, B1, B2 and D run alone.** Only C and E run in parallel, each agent in its own git worktree/branch.
- **The schema is shared.** B1 creates every P0 table up front. Wave C agents don't edit `prisma/schema.prisma`. If one needs a change, it writes it to `docs/shared-changes.md`, and the merge step applies it as one migration.
- Review and merge each wave before starting the next.

---

## 5. Prompts

### Common header (paste at the start of every prompt below)

> Re-read CLAUDE.md, docs/system-flow.md, docs/client-requirements.pdf, docs/research-report.md, docs/audit-report.md and docs/production-roadmap.md. Follow CLAUDE.md's architecture principles and UI rules. Work in vertical slices and commit after each working slice. Before finishing: lint, typecheck, build and tests must pass. Update docs/audit-report.md status for every item you complete. If a business rule is unclear, add it to the open questions in docs/system-flow.md and use the default from docs/production-roadmap.md section 3, rather than guessing silently.

### Wave A: Quick fixes and tests (1 agent, start now)

> Fix these on the current app, without adding a backend yet:
>
> **Tests first:** add Vitest with an `npm test` script. Write unit tests for `src/lib/money.ts`, the invoice builder (GST intra/inter-state split, CGST must equal SGST exactly, rounding), ageing, date helpers, PF/ESI/PT calculations, net salary, subcontractor balances and receivables. These tests must keep passing when the backend arrives, so test pure functions.
>
> **Bugs from docs/audit-report.md section 5:**
> - **GST data:**
>   - B1: give organisations valid GSTINs and require a customer GSTIN on invoices.
>   - B4: invoice numbers of 16 characters or fewer, in a series per GSTIN per financial year that resets each year.
>   - B5: reject impossible dates, and accept DD-MM-YYYY everywhere.
>   - B6: default the GSTIN from the project and block a wrong-state GSTIN.
>   - B7: record retention and GST-TDS entries from invoices.
>   - B15 and B19/B20: safe money parsing, no `Number()` on money.
>   - B16: GSTIN, unique code and manager on conversion.
>   - B17: validate GSTIN checksum, state code and PAN.
>   - B18: make CGST equal SGST.
> - **Consistent figures:** create one shared definition each for ageing (B9), subcontractor payable and balance (B10), billed (state whether incl. or excl. GST, B24) and employee count. Use them on every screen. Make every total ignore soft-deleted rows (B11).
> - **Payroll:**
>   - B12: recover advances from the advance balance.
>   - B13: PF on basic+DA with the statutory employer split. Read the PF wage ceiling from a constant with an effective date: ₹15,000 before 17-09-2026, ₹25,000 from that date.
>   - B14: payslip days and overtime come from attendance; no payslips outside the employment period.
> - **Links:** make every dashboard and finance drill-down apply its filter (B8). Keep list filters in the URL so they are remembered (B21). After conversion, "Open project" opens the new project. Fix B22, B23 and B26.
> - **Pages:** add `loading.tsx`, `error.tsx`, `not-found.tsx` and `global-error.tsx`. Make detail pages open for records created in the browser (B25).
> - **Cleanup:** remove `/home`, unused UI files, the `tender-crm/` folder and default SVGs. Merge the three "needs attention" builders into one. Add `tailwind-merge`. Move `shadcn` and `tsx` to devDependencies.
>
> Then open the app in a browser at 360, 768 and 1280px and fix layout breaks and console errors.

### Wave B1: Data foundation (1 agent, after A is merged)

> Move the app from browser storage to **PostgreSQL + Prisma**. Do not change the UI yet.
>
> 1. **Schema.** Design `prisma/schema.prisma` from docs/data-model-full.md, re-centred on the research report's core idea: the **work order (contract) is the hub**. Keep "Project" as the UI name, but the model must carry the contract attributes from research P0 #1: client unit and GSTIN, plant, central/state jurisdiction, billing GSTIN, tax basis, escalation type, billing cycle, deployment norms, LD/penalty clauses, PBG/SD/retention terms, defect liability period, subletting permission.
> 2. **Coverage.** Include every table needed for research P0 #1–18 and the audit's P0/P1 workflows, so module agents don't need schema changes later:
>    - **Tenders:** the expanded tender state machine and multi-date milestones with corrigendum versions; the document vault with validity dates.
>    - **Instruments and approvals:** the financial-instrument ledger (EMD/PBG/SD/retention with events); the approval engine (flows, levels, requests, steps, actions).
>    - **Platform:** audit log; notifications and rules; files.
>    - **Workforce:** worker onboarding documents with expiries; attendance; payroll runs and payslips; advances ledger.
>    - **Subcontractors:** work orders, bills, deductions, compliance documents.
>    - **Billing and finance:** bill lifecycle (draft bill vs tax invoice, PSU portal stages, diary number); bill-readiness checklist per work order; receipts allocated to deductions; GST filing per GSTIN per period.
> 3. **Rules engine.** Add a **versioned statutory rules engine**: tables for minimum wage/VDA by jurisdiction, zone and skill, PF/ESI ceilings and rates, professional tax slabs by state, GST rates, TDS rates, EMD/PBG percentages and reminder periods. Each row has `effectiveFrom`, `effectiveTo` and `sourceDocument`. All calculations read rates for the relevant date.
> 4. **Conventions.** Money as Decimal(14,2), soft delete, `createdBy`/`updatedBy`, optimistic locking on money records, as CLAUDE.md says.
> 5. **Migration and seed.** Create the migration. Port the existing deterministic seed into `prisma/seed.ts` and keep a demo-data flag, separate from real data.
> 6. **Data layer.** Replace the Zustand data store with server-side reads behind the **same function names in `src/lib/data/`**, so screens keep working. Session/UI preferences can stay client-side.
> 7. **Setup.** Add `.env.example`, a local Postgres via docker-compose, and README setup steps.
>
> Write docs/data-model.md describing the final schema. Plan first and wait for my approval of the schema before writing the migration.

### Wave B2: Platform core (1 agent, after B1)

> Build the platform every module will use, then migrate **Tenders end to end** as the reference module that the other agents will copy.
>
> - **Auth.js:** email + password, sessions, password reset, account lockout. Remove the role switcher from production builds; keep it behind a dev-only flag for demos.
> - **Permissions:** server-side `can(user, permission, scope)` with ALL / OWN_REGION / OWN_PROJECTS / OWN_SITES. Enforce it in every server action and every data read, filtering rows by scope, not just hiding buttons.
> - **Service pattern:** server actions → Zod validation → permission check → service in a transaction → audit entry in the same transaction. Put shared helpers in `src/lib/` and document the pattern in CLAUDE.md.
> - **Audit log:** append-only, with before/after, changed fields and reason. Reasons are mandatory for amounts, approvals, tender results and payroll. Add an audit viewer and a "History" tab on detail pages.
> - **Approval engine:** multi-level, amount/region thresholds, ANY/ALL, delegation, no self-approval, maker-checker. On final approval or rejection, the engine calls the owning module's handler, which **updates the source record**.
> - **Notification engine:** pg-boss scheduled jobs that create stored notifications from rules in settings: deadlines, document expiries, BG expiries, wage-payment countdown, bills awaiting approval. In-app now; email via a provider interface (log to console in dev).
> - **File storage:** S3-compatible interface (local folder in dev), size and type limits, image compression, virus-scan hook placeholder, signed URLs.
> - **Security:** security headers, rate limiting on auth and writes, input sanitisation.
> - **CI:** GitHub Actions for lint, typecheck, test and build.
> - **Reference module (Tenders):** create/edit/soft-delete with real stage transitions through the expanded state machine (research P0 #2), each move audited and gated by permissions; GO/NO-GO through the approval engine.
>
> Add integration tests for permissions, scope filtering, the audit trail and approval write-back.

### Wave C: Modules (4 agents in parallel, after B2)

Run each in its own worktree from the B2 commit. Add this to each prompt after the common header:

> Follow the Tenders reference module's pattern exactly (server actions, Zod, `can()`, transaction, audit). **Do not edit `prisma/schema.prisma`** or shared `src/lib` platform code; write needed changes to docs/shared-changes.md. Every action must work end to end against the database, with tests for its money/logic rules. Keep screens responsive and consistent with existing components.

**C1: Tenders depth**
> Build on the reference Tenders module:
> - Multi-milestone dates (query, pre-bid, online, physical submission, technical opening, price opening) with corrigendum versioning that recalculates reminders.
> - A document vault (DSC, GST, PAN, ISO, Udyam, PF/ESI codes, labour licence, solvency, CA certificates, enlistments). Each tender checks every required document's validity against its due date, blocks "Submitted" if something is expired, and sends alerts at 60/30/7 days.
> - Eligibility notes and a credentials library of completed work for PQ.
> - The EMD/PBG instrument ledger: arrange, extend, refund requested, refunded, adjusted, forfeited, with bank-wise utilisation.
> - Lost reasons with the L1 bidder and price gap; competitor records.
> - **LoA intake → task chain** (acceptance, PBG, agreement, Integrity Pact, Shram Suvidha 15-day intimation, licence, insurance, mobilisation) → **convert to contract**, carrying over all contract attributes and documents.
> - Edit and soft-delete.

**C2: Contracts (Projects) + Subcontractors**
> - **Contracts:** full contract master with clause attributes; edit and soft-delete; BOQ editor and Excel import; sites/zones; team.
> - **Subcontractor master:** with PAN, GSTIN, Udyam and constitution validation.
> - **Work orders:** per project; work-order progress updates.
> - **Bill and payment entry:**
>   - deductions (TDS by PAN type, retention, advances, penalties);
>   - retention withhold and release;
>   - the subcontractor compliance gate, where payment is held until labour licence and worker PF/ESI proofs are uploaded;
>   - the GST portion released on GSTR-2B match (manual confirmation for now).
> - **Approvals:** bills go through the approval engine.
> - **Payable:** one definition, used everywhere.
> - **Subcontractor dashboard:** by trade and by subcontractor.

**C3: Workforce + Payroll**
> - **Worker onboarding:** KYC, bank details, UAN, police verification, medical, induction, gate pass, PPE, height/skill certificates, each with expiry alerts; bulk appointment letters.
> - **Site assignment and transfers.**
> - **Attendance:** supervisor gang marking, leave, overtime with caps, holidays and week-offs from settings.
> - **Payroll engine** reading the rules engine by date:
>   - days and overtime from attendance;
>   - basic+DA and minimum wage check;
>   - PF employee/employer split with the ceiling by date;
>   - ESI, state professional tax slabs;
>   - advance recovery against the advances ledger.
> - **Payroll run lifecycle:**
>   - draft → approval → lock → paid / on hold, with reasons;
>   - PF/ESI remittance records (challan number, date, TRRN);
>   - an EPF ECR text file export and a bank payout file;
>   - a 7-day wage-payment countdown;
>   - full and final settlement within 2 working days.
> - **Payroll dashboard:** live figures.
> - **Data protection:** mask PAN, bank and Aadhaar (last 4 only) except for permitted roles.

**C4: Billing + Finance**
> - **Bill lifecycle:** draft monthly bill/RA bill per work order, then tax invoice. Monthly bill shells are created automatically, with an "unbilled months" report.
> - **Bill-readiness checklist** per work order, configurable per PSU. It blocks "Submitted" until the wage register, bank proof, ECR + TRRN, ESIC challan and licence/insurance validity are attached, and pulls those from payroll automatically.
> - **PSU portal stages** with diary number, a log of document shortfalls the PSU raised, days-in-stage and escalation.
> - **Invoices:** series per GSTIN per financial year; e-invoice IRN fields and the 30-day ageing warning.
> - **Receipts:** allocated to deductions (IT-TDS, GST-TDS, labour cess, retention, penalties, LD), with dispute items for unexplained differences.
> - **GST:** filing per GSTIN per period (mark filed + reference), GSTR-1/3B period view, net liability.
> - **Cash locked with PSUs:** a summary of EMD, PBG, SD, retention, uncredited TDS/GST-TDS and pending claims.
> - **Receivables:** ageing using the shared definition.

### Wave D1: Merge + dashboard + settings (1 agent, after all C branches finish)

> 1. **Merge** C1–C4 one at a time. Apply docs/shared-changes.md as one migration. Fix cross-module links.
> 2. **Dashboard:** rebuild the director dashboard on real data. Keep the client's 13 items and add the research's outcome metrics: tender pipeline value and hit rate, cash locked with PSUs by type, bills by stage and ageing, unbilled months, compliance blockers per work order, margin by contract and plant, BG limit headroom, statutory deadlines this week. Role-specific homes must come from configuration, not role-key string checks.
> 3. **Settings:** build editors for everything the audit lists as hard-coded: stages, checklists per PSU and tender type, deduction types, project statuses, health thresholds, reminder periods, approval flows and levels, payroll and statutory rules (rules engine with effective dates), GSTINs, labour types, code formats. Add custom fields on tenders, contracts, workers and bills.
> 4. **Global search** across tenders, contracts, workers, subcontractors and bills.

### Wave D2: Hardening and go-live (1 agent, after D1)

> Make it ready for a pilot:
> - **Tests:** Playwright e2e on desktop and a 360px viewport. Flows:
>   - register tender → stages → GO → submit → win → LoA chain → convert;
>   - onboard worker → attendance → payroll run → approve → paid → ECR export;
>   - monthly bill → readiness checklist → submit → receipt with deductions;
>   - subcontractor bill → approval → payment.
> - **Security:** OWASP review, dependency audit.
> - **DPDP Act basics:** purpose notice, consent records for workers, retention and deletion workflow, an access log for sensitive fields, encryption at rest for PAN, bank and Aadhaar fields.
> - **Operations:** backups with a tested restore, error tracking (Sentry or similar), structured logging, uptime monitoring, a performance budget.
> - **Quality:** an accessibility and responsive pass at 360, 768, 1280 and 1440px with keyboard testing.
> - **Deployment:** staging and production environments and a deployment guide.
> - **Docs:** a short user guide per role (Director, Tender, PM, Site Supervisor, HR/Payroll, Accounts).
> - **Pilot import:** Excel import templates for loading real masters (employees, subcontractors, contracts, open tenders).
> - Finish with a go-live checklist in docs/go-live.md.

### Wave E: Differentiators (after the pilot starts, parallel)

Pick based on pilot feedback. One agent each, same rules as wave C:
- **E1:** PWA with offline gang attendance and daily-report drafts, photo compression, Hindi/Marathi UI.
- **E2:** PSU gate/CLIMS import and three-way attendance reconciliation, with an exception queue.
- **E3:** Change-in-law/variation claims (VDA, PF ceiling, GST 12%→18%), hindrance and extension-of-time register, JMR capture.
- **E4:** Contract P&L and cash-flow forecast; MSME payment clock with interest calculator and Samadhaan pack; tax reconciliation (GSTR-7, TDS).
- **E5:** Tally integration (masters out, invoices out, receipts in) and WhatsApp payslips/notifications.
- **E6:** Manpower rate analysis and bid pricing from own cost history; competitor analytics; director copilot.
- **E7:** Safety module: permits, inductions, toolbox talks, incidents, penalties.
