# Government Contractor CRM — System Flow

> **Source of truth for business flow.** This document describes how a government contractor's work happens in real life and how the CRM must support it. When code and this document disagree, raise it — don't silently pick one.
>
> Sections marked **[ADDED]** extend the original research PDF with requirements common to Indian government contracting. Confirm these with the client before building the affected module.

---

## 1. The Big Picture

```
Tender → GO/NO-GO → Tender Preparation → EMD/Documents → Bid Submission → Evaluation
→ Won/Lost → PBG/Agreement → Project → Site Work → Attendance/Payroll
→ Purchases/Subcontractors → Billing/Payments → GST/EPF/Accounts → Director Dashboard
```

The CRM must **not** behave like a collection of separate apps. A tender becomes a project when won, and the project carries its information into work, people, money and management reporting.

**Core design principle: enter information once; reuse it everywhere.**
- Tender → Project: client/department, region, GSTIN, contract value, dates, documents.
- Project/Site → work updates, attendance, purchases, subcontractor billing, financial reporting.
- Directors see results on the dashboard without staff preparing separate reports.

---

## 2. Organisation

### 2.1 Regions
Initial regions (configurable, not hard-coded):

| Region | State | Notes |
|---|---|---|
| Korba | Chhattisgarh | |
| Delhi | Delhi | |
| Maharashtra | Maharashtra | |

### 2.2 GST registrations **[ADDED]**
A company usually holds **one GSTIN per state**. Each region/office links to a GSTIN. Every project, invoice, RA bill and purchase must be tagged to the correct GSTIN so GST reports can be produced per registration.

### 2.3 Roles

| Role | Main responsibility |
|---|---|
| Director / MD | Final business decisions, tender approval, major project decisions, overall financial and operational visibility. |
| Tender Executive / Tender Team | Find tenders, study documents, prepare bids, collect documents, coordinate approvals, submit bids. |
| Regional Head | Regional feasibility, resources, location and execution capability; may approve GO/NO-GO. |
| Accounts / Finance | EMD, tender fees, PBG, purchases, payments, payroll, GST and financial records. |
| Legal / Admin | Company documents, declarations, agreements, authorisations, compliance documentation. |
| Project Manager | Owns the project after award: execution plan, resources, BOQ, site team, progress. |
| Site Engineer / Supervisor | Daily work updates, manpower, materials, progress, site issues, photos. |
| Subcontractor | Executes assigned work under contract; submits bills/payment claims. (External — may get limited portal access later.) |

Roles are **data, not code**. Admin can create roles and assign permissions.

### 2.4 Permissions
Each role gets permissions per module: `VIEW`, `CREATE`, `EDIT`, `APPROVE`, `ASSIGN_WORK`, `SUBMIT`, `REJECT`, `MANAGE_FINANCE`.

Permissions can be **scoped**: all regions, own region, own projects only, own sites only.

### 2.5 Reporting hierarchy & work allocation
Do **not** hard-code one hierarchy. Different projects may use different reporting structures. Admin configures who reports to whom and who can assign work.

Default example:
```
Director → Regional Head → Project Manager → Site Engineer → Supervisor → Workers
```

---

## 3. Tender Management

### 3.1 Definitions
- **Tender** — the government's invitation for eligible companies to compete for a works contract.
- **Bid** — the company's formal offer: quoted price plus required qualifications/documents.
- **EMD (Earnest Money Deposit)** — security deposited to participate. Refunded or adjusted per tender conditions (refunded if lost; often adjusted/converted if won).
- **L1** — lowest financial bidder (typically awarded the work).
- **LoA** — Letter of Acceptance from the department.
- **PBG (Performance Bank Guarantee)** — performance security furnished after award.

### 3.2 Steps

| # | Step | Owner | What the CRM records |
|---|---|---|---|
| 1 | Find the tender | Tender Executive | Source portal, link |
| 2 | Register | Tender Executive | Tender no., department, region, location, estimate, EMD amount, tender fee, key dates (publish, pre-bid, submission deadline, technical opening, financial opening), documents, assigned owner |
| 3 | GO / NO-GO | Director / Regional Head | Decision, decided by, date, **reason (mandatory for NO-GO)** |
| 4 | Prepare documents | Tender Team / Legal | Checklist of required documents (configurable per tender type) with status |
| 5 | Arrange EMD | Accounts | Mode (DD / BG / online / exemption), instrument no., bank, amount, date, expiry |
| 6 | Prepare bid | Tender Team + Director | Quoted amount, % above/below estimate, technical & financial submission |
| 7 | Submit bid | Tender Executive | Submission date/time, portal acknowledgement upload |
| 8 | Technical evaluation | — | Qualified / Rejected, clarification requests & responses |
| 9 | Financial evaluation | — | Own bid, L1 bidder & amount, our rank, competitor bids (optional) |
| 10 | Result | — | Won / Lost / Cancelled / Retender / other configured result |
| 11 | Award & agreement | Accounts / Legal | LoA, agreement no. & date, PBG details (amount, bank, expiry), other conditions, EMD refund/adjustment |
| 12 | Convert to project | Director / PM | One-click conversion once award conditions are met |

### 3.3 Default tender stages (configurable)
`IDENTIFIED → REGISTERED → GO_NO_GO_PENDING → NO_GO | PREPARATION → EMD_ARRANGED → SUBMITTED → TECHNICAL_EVALUATION → FINANCIAL_EVALUATION → WON | LOST | CANCELLED → AWARDED → AGREEMENT_SIGNED → CONVERTED_TO_PROJECT`

### 3.4 Worked example — ₹2.40 Crore road tender, Korba

| Stage | Value |
|---|---|
| Government estimate | ₹2.40 Crore |
| EMD | ₹4.80 Lakh |
| Company bid | ₹2.31 Crore |
| Technical result | Qualified |
| Financial result | Company is L1 |
| Award | Won |
| Next steps | PBG → Agreement → Project |

Use this as seed data.

---

## 4. Project Management

A won tender becomes an operational project. Tender fields flow into the project automatically.

- **Overview:** contract value, start/end dates, client/department, region, GSTIN, project manager, status.
- **BOQ & scope:** work items, unit, quantity, rate, amount, executed quantity, progress.
- **Sites:** one project can have one or many sites/work locations.
- **Team:** PM, engineers, supervisors, workers, assigned subcontractors.
- **Daily progress:** see §5.
- **Health:** Green / Amber / Red (configurable rules and labels).
- **Budget & actuals:** planned cost, committed cost (approved POs/work orders), actual cost, remaining budget.
- **Billing & collections:** work done, RA bills raised, amount received, deductions, outstanding.
- **Project documents:** agreement, drawings, approvals, correspondence.

---

## 5. Daily Work Update

A simple, **mobile-friendly** report submitted by the site engineer/supervisor per site per day.

| Field | Example |
|---|---|
| Date / Site | 07-10-2026 / Korba Road Site 1 |
| Work item (link to BOQ) | Road excavation |
| Planned | 500 m |
| Completed | 420 m |
| Progress | 84% (calculated) |
| Workers | 32 |
| Equipment | 2 excavators |
| Materials used | (optional, links to site stock) |
| Issues | Heavy rain caused delay |
| Photos | Attached (geo/time-stamped if possible) |
| Plan for tomorrow | Continue excavation |

Rules:
- Missing report by a configurable cut-off → alert to PM.
- PM can review/comment; directors see a roll-up.
- Must work on slow mobile connections (small payloads, compressed photos).

---

## 6. Workforce — Attendance & Payroll

```
Employee → Site/Project assignment → Attendance → Leave/Overtime → Payroll → EPF/Deductions → Net Salary
```

- Attendance is linked to **both employee and project/site** (needed for project labour cost).
- Features: mobile attendance (by supervisor or self), site assignment, shifts, overtime, leave, transfers between sites, payroll history.
- **[ADDED] Labour types** — payroll rules differ for:
  - Monthly staff (salary structure, EPF, ESI if applicable, professional tax per state)
  - Daily-wage workers (rate × days + OT)
  - Contract labour supplied by a labour contractor (paid via contractor bill, not payroll; compliance proof tracked)
- **EPF:** calculated from payroll per configured rules; produce an export suitable for EPFO filing.
- Payroll rules (wage components, EPF ceiling, OT rates) are **settings, not code**.

---

## 7. Subcontractor Management

- Subcontractor is a **reusable master record**: name, GSTIN, PAN, bank details, contact, trade/category.
- **Many-to-many** with projects: `Subcontractor A → Project 1, Project 4, Project 7`.
- Per assignment: scope of work, work order no., contract value, rates.
- Bills → approval workflow → payment.
- **[ADDED] Deductions on bills:** retention money, TDS, advances recovered, material issued recovery, penalties. Track retention released later.
- Outstanding balance per subcontractor, per project, and overall.

---

## 8. Purchases & Vendors

```
Site Request → Approval → Vendor/Quotation → Purchase Order → Goods Receipt → Invoice → Payment → Project Cost
```

- Purchases always link to a **project (and site)** — never isolated entries.
- Vendor master: GSTIN, PAN, bank details.
- **[ADDED] Site stock (simple):** material received at site, issued/consumed, balance. Keeps project cost and wastage visible.

---

## 9. Accounts, Billing & Payments

**Money in:** government/client RA bills and receipts, EMD/PBG refunds, retention released.
**Money out:** salaries, subcontractor payments, vendor payments, purchases, expenses, tender fees, EMD.

### 9.1 RA (Running Account) bills to the department **[ADDED]**
Government work is usually billed periodically on measured work:
- Bill no., period, BOQ items × executed quantity × rate.
- Cumulative vs. this-bill amounts.
- Department deductions: security deposit/retention, income-tax TDS, GST TDS, labour cess, penalties/LD, recovery of advances.
- Net payable, amount received, date received, outstanding.

### 9.2 Accounting boundary **[ADDED — confirm with client]**
The CRM is the **operational and management system**. It produces GST and EPF **reports and exports**; actual return filing and statutory books stay in the client's accounting software (likely Tally) or with their CA. A Tally export/integration can be added later.

---

## 10. GST & EPF

- **GST:** data flows from purchases, vendor invoices, subcontractor bills and RA bills into GST records, **per GSTIN**. Reports: outward supplies, inward supplies / input tax credit, GST TDS deducted by departments.
- **EPF:** employee master + payroll feed EPF calculations; export for filing.

---

## 11. Director Dashboard

| Area | What directors see |
|---|---|
| Tenders | Active tenders, upcoming deadlines, pending approvals, pipeline by stage, wins/losses, total tender value, win rate |
| Projects | Active projects, progress, delayed/critical projects, contract values, completion status |
| Money | EMD locked, PBG/security outstanding, receivables, payables, project spending vs budget, collections |
| Work | Daily site status, progress, manpower, major issues, missing reports |
| Approvals | Pending tender, purchase, subcontractor bill and other approvals |
| Alerts | Deadlines, EMD/refund follow-ups, overdue payments, delayed projects, missing site reports |

All widgets filterable by **region** and **date range**.

---

## 12. Notifications & Automation

Configurable intervals and recipients:
- Tender deadline reminders (default 7 / 3 / 1 days)
- Pending management approval
- Mandatory tender document missing
- EMD payment / refund follow-up
- PBG / agreement deadline; PBG and BG expiry
- Project delay or critical status
- Daily site update not submitted
- Government/client payment overdue
- Subcontractor bill awaiting approval
- Attendance missing or abnormal

Channels: in-app first; email/WhatsApp/SMS later.

---

## 13. Audit Trail

Every important action is logged:
```
User → Action → Entity → Date/Time → Previous value → New value → Reason
```
Sensitive changes (amounts, approvals, tender results, payroll) **require a reason**, and optionally approval. Audit records are append-only.

---

## 14. Flexibility — Configurable, Not Hard-Coded

Admin-configurable from Settings:
- Regions / states / offices / GSTINs
- Departments and teams
- Roles, permissions and reporting hierarchy
- Tender stages and results
- Required tender documents (per tender type)
- Approval levels and thresholds (e.g. purchases above ₹X need Director)
- Reminder periods
- Project statuses and health rules
- Expense categories
- Payroll rules
- Subcontractor bill workflow and deduction types
- Notification rules

---

## 15. Navigation

```
Dashboard → Tenders → Projects → Sites / Work → People & Teams → Subcontractors
→ Attendance & Payroll → Purchases → Accounts & Payments → GST → EPF
→ Reports → Approvals → Notifications → Settings
```

---

## 16. Final End-to-End Flow

```
Government Tender → Tender Registration → GO/NO-GO → Document Preparation → EMD → Bid
→ Technical Evaluation → Financial Evaluation → Won/Lost → PBG → Agreement → Convert to Project
→ Project Planning → Site Assignment → Work Allocation → Daily Work Updates → Attendance
→ Payroll/EPF → Purchases → Subcontractor Bills → Government RA Billing → Payments
→ GST/Accounts → Director Dashboard
```

> Exact tender stages, EMD/PBG treatment, approvals and statutory workflows must be configured from the company's actual tender documents and applicable rules. This is a process/design guide, not legal or accounting advice.

---

## 17. Open Questions for the Client

1. Share the existing tender tracking format (Excel?) so fields match.
2. Who approves GO/NO-GO — Director only, or Regional Head below a value threshold?
3. Attendance method per site: supervisor marks, mobile self-check-in, or biometric?
4. Labour mix: monthly staff vs daily wage vs labour contractors?
5. Accounting software in use (Tally?) and whether integration is needed.
6. GSTINs held — one per state?
7. Is material/inventory tracking at site needed in phase 1?
8. Should subcontractors get their own login to submit bills?
9. Priority order of modules for go-live.
