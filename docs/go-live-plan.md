# S. Prince Management Tool: Go-Live Plan (Phase 1)

Decisions locked in:
- **Database, login and file storage:** Supabase (Mumbai region, `ap-south-1`)
- **Hosting:** Hostinger VPS (choose the India location if your plan offers it)
- **Security:** every action checked on the server; the browser is never trusted
- **Go-live order:** Phase 1 = Tenders, Projects, Subcontractors, Dashboard, Approvals. Phase 2 = GST & invoices. Phase 3 = Employees & payroll.

This file is the source of truth for logins, roles and the go-live sprint. Agents must read it.

---

## 1. Architecture

| Layer | Choice | Notes |
|---|---|---|
| App | Next.js (existing) running on the VPS with PM2, behind Nginx | One server process + one background worker process |
| Database | Supabase Postgres (Mumbai) | Schema and migrations managed with **Prisma** in the repo |
| Login | **Supabase Auth** (email + password; phone OTP later for site staff) | Replaces Auth.js in CLAUDE.md |
| Files | **Supabase Storage**, private buckets, signed URLs | Replaces S3 in CLAUDE.md |
| Jobs | **pg-boss** worker on the VPS (runs via PM2) | Reminders, expiry alerts, heavy exports |
| Data access | **Server only.** All reads/writes go through Next.js server actions/route handlers using a server-side DB connection | The browser never queries the database directly |
| Supabase RLS | **Enabled on every table with no public policies** | Blocks direct access with the public key: defence in depth |
| Monitoring | Sentry (errors) + uptime monitor + daily backups | |

---

## 2. Logins and roles (confirmed)

### 2.1 Logins: one per role, six in total

| # | Role | Logins | Scope | Build level |
|---|---|---|---|---|
| 1 | **System Admin** | 1 | All | **Production, end to end** |
| 2 | **Director** | 1 | All regions | **Production, end to end** |
| 3 | **Regional Head** | 1 | Assigned region(s), multi-select, so one login can cover Korba, Delhi and Maharashtra if needed | **Production, end to end** |
| 4 | **Tender Executive** | 1 | All regions | **Production, end to end** |
| 5 | **Project Manager** | 1 | Assigned projects | **MVP** |
| 6 | **Accounts** | 1 | All regions | **MVP** |
|  | **Total** | **6** | | |

No Viewer role. More users per role can be added later by the System Admin without code changes.

**What the build levels mean:**
- **Production:** every screen and action works against the database, is permission-checked, audited and covered by end-to-end tests.
- **MVP:** the user can log in and do their core actions on real data with server-side permission checks and audit. Fewer edge cases, lighter polish, and unit/integration tests rather than full end-to-end coverage.
  - **Project Manager core actions:** view own projects, update progress, create subcontractor work orders and bills, review daily reports.
  - **Accounts core actions:** record EMD/PBG details, record subcontractor payments, view balances.

Later phases: HR / Payroll and Site Supervisor roles (Phase 3); subcontractor portal users (later).

### 2.2 Permission matrix

Legend: **V** view · **C** create · **E** edit · **D** soft-delete · **A** approve/reject · **—** no access. Scope applies on top of the matrix (own region / own projects).

| Module | System Admin | Director | Regional Head | Tender Exec | Project Manager *(MVP)* | Accounts *(MVP)* |
|---|---|---|---|---|---|---|
| Dashboard | V | V (all) | V (region) | V (tenders) | V (own projects) | V (finance) |
| Tenders | V | V, A | V, C, E, A* | V, C, E, D | V | V (EMD/fees) |
| GO / NO-GO decision | — | A | A* | Submit | — | — |
| EMD / PBG / instruments | V | V, A | V | V, C | V | V, C, E |
| Convert tender → project | — | A | A | Submit | — | — |
| Projects / contracts | V | V | V, C, E | V | V, E (own) | V |
| Subcontractors (master) | V | V | V, C, E | — | V, C | V, C, E |
| Subcontractor work orders | V | V, A | V, C, E, A* | — | V, C, E (own) | V |
| Subcontractor bills | V | V, A | V, A* | — | V, C (own) | V, E |
| Subcontractor payments | V | V, A | V | — | V | V, C |
| Daily work reports | V | V | V | — | V, review (own) | — |
| Approvals inbox | — | A (all) | A (region) | own requests | own requests | own requests |
| Notifications | own | own | own | own | own | own |
| Audit log | V | V | V (region) | — | — | V |
| Settings and masters | V, C, E | V | — | — | — | — |
| Users and roles | V, C, E, D | V | — | — | — | — |
| GST & invoices *(Phase 2)* | V | V | V (region) | — | V (own) | V, C, E |
| Employees / payroll *(Phase 3)* | — | V | V (region) | — | V (own sites, no salary) | V (payments) |

\* **Threshold rule (default, configurable):** a Regional Head can approve up to **₹1 crore** tender value / **₹10 lakh** bill or work order. Above that, a Director must approve.

### 2.3 Rules that always apply
- **Maker-checker:** nobody approves their own request.
- **Reasons required** for rejections, NO-GO, tender result changes, amount edits and deletions; all go to the audit log.
- **Sensitive fields** (PAN, bank, salary, Aadhaar) are masked except for roles that need them. In Phase 3 that means Director, HR/Payroll and Accounts (payments only).
- **System Admin manages users and settings but does not approve business transactions.**
- Roles, permissions, scopes and thresholds are **data in the database**, editable by System Admin, not hard-coded.

---

## 3. Go-live sprint

```
S1 (alone) → S2 (alone) → S3-A, S3-B, S3-C, S3-D (parallel) → S4 (alone) → Go-live
```

| Step | Content |
|---|---|
| **S1** | Supabase + Prisma schema + data layer swap |
| **S2** | Supabase Auth login, RBAC, server-side checks, audit log, approval write-back |
| **S3-A** | Tender workflows real |
| **S3-B** | Projects + subcontractor actions real |
| **S3-C** | Dashboard, approvals, notifications, user admin on real data |
| **S3-D** | Hostinger VPS deployment, CI/CD, backups, monitoring |
| **S4** | Merge, end-to-end tests, security pass, real-data import, go-live checklist |

**Before S1, prepare:**
- A Supabase project in **Mumbai**, owned by S. Prince's account if possible. Collect the database URL, the pooled URL, the anon key and the service-role key.
- Hostinger VPS access (SSH), a domain or subdomain (e.g. `crm.sprincehightech.com`) and a GitHub repository.
- From S. Prince: the six users (name, email, and region for the Regional Head) and current data in Excel (open tenders, projects, subcontractors).
- **Secrets never go in chat or git.** Put the Supabase keys in a local `.env` file (gitignored) for the agents, and in the server's `.env` on the VPS.

The prompts follow in section 5.

---

## 4. Go-live checklist (S4 must complete)

- [ ] All Phase 1 workflows work end to end against Supabase
- [ ] Role switcher disabled in production; demo seed **not** loaded in production
- [ ] Every server action has validation + permission + scope checks; tests prove a user can't see another region's data
- [ ] Audit log written for every change
- [ ] RLS enabled on all tables with no public policies; service-role key only on the server
- [ ] HTTPS, security headers, rate limiting on login
- [ ] Daily DB backup + **tested restore**; Supabase point-in-time recovery if on a paid plan
- [ ] Sentry receiving errors; uptime monitor alerting you
- [ ] Real users created and roles assigned; each user tested with their own login
- [ ] Real data imported from Excel and spot-checked with S. Prince
- [ ] User guide (1 page per role) shared
- [ ] Rollback plan: previous release can be restored in minutes

---

## 5. Prompts

### Common header (paste at the start of every prompt)

> Re-read CLAUDE.md, docs/go-live-plan.md, docs/system-flow.md, docs/client-requirements.pdf, docs/audit-report.md and docs/production-roadmap.md. **docs/go-live-plan.md overrides the roadmap where they differ** (Supabase instead of Auth.js/S3, Hostinger VPS instead of Vercel, Phase 1 scope only). Follow CLAUDE.md's architecture principles. Commit after each working slice. Before finishing: lint, typecheck, tests and build must pass.

### S1: Supabase + schema + data layer (alone)

> Connect the app to **Supabase Postgres (Mumbai)** using **Prisma** for schema and migrations.
> 1. **CLAUDE.md:** update the tech stack and commands to match docs/go-live-plan.md section 1.
> 2. **Schema:** design `prisma/schema.prisma` for **Phase 1 plus the core platform**, following docs/data-model-full.md and the work-order-as-hub idea from docs/research-report.md.
>    - **Users and access:** users (linked to Supabase Auth user id), roles, permissions, role-permission with scope, user-region, project members, approval thresholds.
>    - **Platform:** audit log, approval flows/requests/steps/actions, notifications, files, settings/masters, organisations, regions, GSTINs, sites.
>    - **Tenders:** tenders with stages and stage history, document checklist, GO/NO-GO, instruments (EMD/PBG with events), award.
>    - **Projects:** projects/contracts with clause fields, BOQ.
>    - **Subcontractors:** subcontractors, work orders, bills with deductions, payments.
>    - **Daily reports.**
>    - Money as Decimal(14,2), soft delete, createdBy/updatedBy, version for optimistic locking.
>    - Phase 2/3 tables (invoices, employees, payroll) may be added now if they already exist in types, but they don't need screens.
> 3. **Migrations:** create them. Enable **RLS on every table with no policies** (a migration with raw SQL), so the public key can't read data.
> 4. **Seeding:** port the deterministic seed to `prisma/seed.ts`, behind a `SEED_DEMO=true` flag. Add a separate `prisma/seed-base.ts` that loads only real masters: regions, GSTINs, roles and permissions from go-live-plan section 2.2, approval thresholds and tender stages.
> 5. **Data layer:** replace the Zustand data store with server-side reads/writes, keeping the **same function names in `src/lib/data/`** so screens keep working. Reads run on the server; writes go through server actions. Keep only UI preferences client-side.
> 6. **Setup files:** add `.env.example` (DATABASE_URL, DIRECT_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) and update the README with setup steps.
>
> Plan first and **show me the schema for approval before running the first migration.** Never commit secrets.

### S2: Login, RBAC, server-side checks, audit (alone, after S1)

> 1. **Login:** Supabase Auth with email + password. Add login, logout, forgot/reset password and first-login password change. Protect every route through middleware. Session lookup happens on the server. **Disable the role switcher in production** (dev-only flag).
> 2. **RBAC:** roles, permissions and scopes exactly as in docs/go-live-plan.md section 2.2, seeded by `seed-base.ts` and stored as data. Build `can(user, module, action, scope)` and `scopeFilter(user, module)` on the server.
>    - **Every** server action and data read must check permission **and** filter rows by scope (own region, own projects, own sites).
>    - The UI hides what the user can't do, but the server is the real check.
> 3. **Rules from section 2.3:**
>    - maker-checker (no self-approval);
>    - mandatory reasons;
>    - masking of sensitive fields;
>    - approval thresholds read from the database (Regional Head up to ₹1 Cr tender / ₹10 L bill by default).
> 4. **Service pattern:** server action → Zod validation → permission + scope check → service in a DB transaction → audit log entry (before/after, reason) in the same transaction. Document this pattern in CLAUDE.md for the next agents.
> 5. **Approval engine:** final approve/reject calls the owning module's handler and **updates the source record**. Each module registers its handler.
> 6. **Tests:** integration tests proving that:
>    - a Korba Regional Head can't read or edit Delhi data;
>    - a Tender Executive can't approve;
>    - self-approval is blocked;
>    - every write creates an audit entry.

### S3: Parallel agents (after S2, each in its own git worktree from the S2 commit)

Add to each prompt:

> Follow the S2 service pattern exactly. **Don't edit `prisma/schema.prisma`** or the shared auth/permission/audit code. Write needed changes to `docs/shared-changes.md`. Every action must work end to end against Supabase, with tests.

**S3-A: Tenders**
> - Make tenders fully work: create, edit, soft-delete, and move through the stages (New → Under Evaluation → Bid Preparing → Submitted → Won/Lost), each move audited and permission-checked.
> - GO/NO-GO goes through the approval engine with thresholds.
> - Document checklist: status updates and file upload to Supabase Storage (private bucket, signed URLs, 10 MB limit, PDF/images only).
> - EMD/PBG actions: arrange, refund requested, refunded, adjusted.
> - Deadline reminders generated as stored notifications by a pg-boss job.
> - Convert to project goes through approval and carries all data and documents.

**S3-B: Projects and subcontractors (MVP depth; Project Manager and Accounts roles)**
> Build to **MVP level** as defined in docs/go-live-plan.md section 2.1: core actions working on real data with server-side checks, audit and integration tests; skip advanced edge cases. Regional Head and Director actions in these screens (approvals) must still be production-grade.
> - **Projects:** create, edit, soft-delete; contract fields; BOQ editor with Excel import.
> - **Subcontractors:** master create/edit with GSTIN/PAN validation.
> - **Work orders:** create, edit, progress updates.
> - **Bills:** entry with deductions (TDS, retention, advances); bills go through the approval engine.
> - **Payments:** entry, updating balances.
> - **Daily reports:** submission and PM review on real data, with photos uploaded to Supabase Storage (compressed on the device first).

**S3-C: Dashboard, approvals, notifications, user admin**
> - **Dashboard:** run all dashboard figures on real data, respecting each user's scope (a Regional Head sees only their region).
> - **Role homes:** come from configuration, not role-key strings.
> - **Approvals inbox:** works on the real approval engine, with threshold routing and a timeline.
> - **Notifications:** stored, read/unread, with email delivery through an SMTP provider interface. Configure via env; log to console if unset.
> - **User admin** (System Admin only):
>   - invite users by email (Supabase invite);
>   - assign roles, regions and projects;
>   - deactivate users and reset passwords;
>   - view the audit log with filters.

**S3-D: Hostinger VPS deployment** (touches only infra/config files)
> Prepare production deployment on a **Hostinger VPS (Ubuntu LTS)**:
> 1. **Server setup:** a step-by-step `docs/deployment.md` plus a setup script for Node LTS, PM2, Nginx, UFW firewall (22, 80, 443 only), fail2ban, automatic security updates and a non-root deploy user with SSH keys.
> 2. **Process and proxy:**
>    - `ecosystem.config.js` for PM2, with two processes: the Next.js app (`next start`) and the pg-boss worker.
>    - Nginx reverse proxy config with gzip, security headers, client body size limit and HTTPS via Let's Encrypt (certbot, auto-renew).
> 3. **CI/CD:** a GitHub Actions workflow. On push to `main`, run lint, typecheck, tests and build, then deploy over SSH: pull, install, `prisma migrate deploy`, build, `pm2 reload` with zero downtime. Keep the previous release for **one-command rollback**.
> 4. **Environment:** production `.env` lives only on the server, with permissions restricted; document every variable.
> 5. **Operations:**
>    - Backups: daily `pg_dump` of Supabase to the VPS and an off-site copy, 30-day retention, plus a documented **restore test**.
>    - Monitoring: Sentry for app errors (env-configured); a health-check endpoint `/api/health` for an uptime monitor.
>    - Log rotation for PM2 logs.
> 6. **Staging:** a staging setup on the same VPS (different port and subdomain) with a separate Supabase project.

### S4: Merge, harden, go live (alone, after all S3 agents finish)

> 1. **Merge** S3-A, S3-B, S3-C and S3-D one at a time, running lint, typecheck, tests and build after each. Apply docs/shared-changes.md as one migration.
> 2. **Tests:** Playwright e2e on desktop and a 360px viewport, with **real logins for the four production roles** (System Admin, Director, Regional Head, Tender Executive):
>    - System Admin creates users and assigns roles and regions;
>    - Tender Exec registers tender → Regional Head approves GO → submit → Won → Director approves conversion;
>    - Director and Regional Head dashboards show correctly scoped figures;
>    - a Regional Head assigned only Korba can't see Delhi data; a Tender Executive can't approve.
>
>    For the MVP roles (Project Manager, Accounts), run one smoke test each: PM adds a work order and bill → Regional Head approves → Accounts records payment.
> 3. **Security pass:**
>    - permission checks on every action;
>    - no secrets in the client bundle;
>    - service-role key server-only;
>    - RLS on all tables;
>    - rate limiting on login;
>    - dependency audit.
> 4. **Real data import:** Excel templates and an import screen for users, open tenders, projects and subcontractors, with a dry-run preview and error report.
> 5. **Docs:** a 1-page user guide per role in `docs/user-guides/`.
> 6. **Checklist:** go through docs/go-live-plan.md section 4, and mark each item done, with evidence, or blocked, with the reason.
> 7. **Deploy to staging** and summarise what I need to do for production: DNS, secrets, user list.
