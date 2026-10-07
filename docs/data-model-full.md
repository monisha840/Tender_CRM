# Full Data Model Proposal (all phases) — DEFERRED

> **Status: reference only. Not being built yet.**
> Phase 1 is currently a **front-end MVP with mock data** (no Prisma, no auth, no backend). The TypeScript types in `src/types/` are a deliberate subset of this model and reuse its entity and field names, so the MVP can later be promoted to Prisma without renaming.
>
> **Open questions (§6): the stated defaults were accepted on 2026-10-07.** Revisit them before the database phase.
>
> Source documents: `system-flow.md` (business flow) and `CLAUDE.md` (conventions). One conflict was raised: system-flow.md §2.2 / §17.6 assumes one GSTIN per state, while this model supports regions with multiple GSTINs (many-to-many), which covers both cases.

---

# 1. Conventions

These apply to every business model unless noted.

| Concern | Decision |
|---|---|
| IDs | String IDs (cuid2/UUIDv7), generated client-side if needed. This matters for offline daily reports and attendance, which need idempotent retries. `AuditLog` uses an auto-increment BigInt. |
| Common columns | `createdAt`, `updatedAt`, `createdById`, `updatedById`, `deletedAt` (soft delete). `version Int` for optimistic locking on money documents. |
| Money / % / qty | `Decimal(14,2)`, `Decimal(7,4)`, and `Decimal(14,3)` for quantities, as in CLAUDE.md. |
| Dates | Pure dates use `@db.Date`. Timestamps are UTC. |
| Scope columns | Transactional tables carry a denormalised `regionId`, and `projectId`/`siteId` where relevant. Scoped permissions and region-filtered dashboards then need no joins. |
| Enum vs config | Enums are used only for fixed technical states: `PermissionAction`, `AttendanceStatus`, `HealthStatus`, payment direction and the like. Anything the doc says is configurable is a table. When code must recognise a configurable row (for example the "won" tender stage), the row carries a nullable `systemKey`, and the admin UI locks that key. |
| Polymorphism | Used only for non-financial cross-cutting data: documents, comments, audit, approvals, notifications. Money links use explicit nullable FKs with a "exactly one set" check. |
| Numbering | `NumberSeries` (§4) handles per-GSTIN, per-financial-year bill, PO and invoice numbers. |

---

# 2. Domain map

```
ORG & ACCESS ─ State, Region, Office, GstRegistration, RegionGstRegistration,
               User, Role, Permission, RolePermission, UserRole, UserRegion
PEOPLE ─────── Employee, ReportingLine, Department, Designation, LabourType
APPROVALS ──── ApprovalFlow → Level → Request → Step → Action, Delegation
AUDIT ──────── AuditLog, AuditPolicy
PLATFORM ───── Document(+Link), Comment, Notification(+Rule), Setting, NumberSeries,
               masters (Unit, ExpenseCategory, DocumentType, DeductionType…)
TENDER ─────── Tender → Bid → Award → SecurityInstrument ──(convert)──┐
PROJECT ────── Project ← ProjectConversion ─ Site ─ BoqItem ─ DailyWorkReport ◄┘
WORKFORCE ──── SiteAssignment → Attendance → PayrollRun → Payslip
PARTIES ────── Party → Subcontractor / Vendor / (Client separate)
SUBCONTRACTOR  WorkOrder (the M:N junction) → SubcontractorBill → deductions
PURCHASE ───── PurchaseRequest → Quotation → PO → GRN → VendorInvoice, StockTransaction
ACCOUNTS ───── RaBill, Payment(+Allocation), Expense, Advance, RetentionEntry
READ MODELS ── CostEntry, GstTransaction
```

---

# 3. The eight focus areas

## 3.1 Configurable roles & scoped permissions

| Entity | Key fields | Purpose |
|---|---|---|
| `Role` | `key`, `name`, `description`, `isSystem`, `isActive` | Admin-created roles. System roles can be edited but not deleted. |
| `Permission` | `module` (string), `action` (enum: VIEW, CREATE, EDIT, APPROVE, ASSIGN_WORK, SUBMIT, REJECT, MANAGE_FINANCE), unique `(module, action)` | The catalogue. It is seeded from code, because `can()` calls reference these keys. Admins don't create permissions. They grant them. |
| `RolePermission` | `roleId`, `permissionId`, `scope` (enum: ALL, OWN_REGION, OWN_PROJECTS, OWN_SITES) | A grant with a scope. Unique on `(roleId, permissionId)`. |
| `UserRole` | `userId`, `roleId`, `validFrom/To` | A user can hold several roles. Effective permission is the widest scope across them. |
| `UserRegion` | `userId`, `regionId` | Defines what "own region" means. |

How the scopes resolve:
- **OWN_REGION** resolves through `UserRegion`.
- **OWN_PROJECTS** resolves through `ProjectMember`, plus projects reached through the user's `SiteAssignment`.
- **OWN_SITES** resolves through `SiteAssignment`.

`can(user, permission, scope)` unions these. The resolved permission set is cached per request or session and invalidated on any role or grant change. Role and grant changes also write to the audit log.

Auth.js adapter tables (`Account`, `Session`, `VerificationToken`) sit beside `User`. `User` also has `userType` (INTERNAL | SUBCONTRACTOR_PORTAL) and a nullable `partyId`, so the later subcontractor portal needs no restructuring.

## 3.2 Reporting hierarchy

Edges run between **Employees**, not Users, because workers in the chain have no logins.

`ReportingLine`:
- `subordinateId` and `managerId`, both → `Employee`
- `scopeType` (GLOBAL | REGION | PROJECT), with nullable `regionId` / `projectId`
- `canAssignWork`, `isPrimary`, `validFrom/To`

Resolution is most specific first: project line, then region line, then global line. That gives each project its own structure while keeping a default tree. The "who can assign work to whom" check is `ReportingLine.canAssignWork AND can(ASSIGN_WORK)`. Cycle prevention happens in the service layer.

`WorkAllocation` is the Phase 2 work-assignment record: `projectId`, `siteId`, `boqItemId?`, `assignedToId`, `assignedById`, `title`, `plannedQty`, `dueDate`, `status`.

## 3.3 Generic approval engine

| Entity | Key fields | Notes |
|---|---|---|
| `ApprovalFlow` | `key`, `name`, `entityType`, `isActive`, `version` | One flow per approvable thing: GO_NO_GO, PURCHASE_REQUEST, PO, SUB_BILL, PAYROLL_RUN, EXPENSE, RA_BILL, ATTENDANCE_CORRECTION, and so on. |
| `ApprovalFlowLevel` | `flowId`, `sequence`, `name`, `approverType` (ROLE / USER / REPORTING_MANAGER), `approverRoleId?`, `approverUserId?`, `managerDepth?`, `minAmount?`, `maxAmount?`, `regionId?`, `mode` (ANY / ALL), `allowSelfApproval`, `slaHours` | Threshold rules like "purchases above ₹X need Director" are levels with `minAmount`. A level is included only if the request amount and region match. |
| `ApprovalRequest` | `flowId`, `flowVersion`, `entityType`, `entityId`, `amount?`, `regionId`, `projectId?`, `title`, `summary Json`, `requestedById`, `status` (PENDING / APPROVED / REJECTED / CANCELLED / CHANGES_REQUESTED), `currentSequence`, `submittedAt`, `completedAt` | The polymorphic link points back to the domain row. The domain row also carries a real `approvalRequestId` FK, so joins and "my pending approvals" are cheap. |
| `ApprovalStep` | `requestId`, `levelId`, `sequence`, resolved `assignedUserId` / `assignedRoleId`, `status`, `dueAt` | Steps are materialised at submit time. Editing a flow later does not alter requests already in flight. |
| `ApprovalAction` | `stepId`, `actorId`, `action` (APPROVE / REJECT / DELEGATE / REASSIGN / COMMENT / REQUEST_CHANGES), `comment`, `at` | Append-only. It drives the approval timeline UI. |
| `ApprovalDelegation` | `fromUserId`, `toUserId`, `validFrom/To`, `flowId?` | Covers an approver on leave. |

Rejecting at any level ends the request, and `reason` is mandatory. The domain service reacts to the outcome inside the same transaction.

## 3.4 Audit log

`AuditLog` is append-only:
- `id` (BigInt), `occurredAt`
- `actorId?` and `actorType` (USER / SYSTEM / JOB)
- `action`, `entityType`, `entityId`
- `regionId?`, `projectId?` (denormalised, so scoped audit views and filters work)
- `before Json`, `after Json`, `changedFields String[]`
- `reason`, `approvalRequestId?`, `requestId`, `ip`, `userAgent`

`AuditPolicy` is a configuration table: `entityType`, `fieldPath?`, `requiresReason`, `requiresApproval`, `approvalFlowId?`. It drives which amount, result and payroll changes demand a reason, per the "sensitive changes" rule.

Append-only is enforced at the database level, not just in the app: revoke UPDATE and DELETE for the app's DB role, plus a trigger that blocks both. The table is indexed on `(entityType, entityId, occurredAt)` and partitioned monthly later. Writes happen in the same transaction as the business change.

## 3.5 Regions with multiple GSTINs

| Entity | Key fields |
|---|---|
| `State` | `code`, `name`, `gstStateCode`. Shared by GSTINs, vendors, professional tax and place of supply. |
| `Region` | `name`, `code`, `stateId`, `isActive`. Seeded with Korba, Delhi and Maharashtra, but not hard-coded. |
| `Office` | `regionId`, `name`, `address`, `isHeadOffice`. This is the "offices" item in §14 of system-flow.md. |
| `GstRegistration` | `gstin` (unique), `legalName`, `tradeName`, `stateId`, `panNumber`, `address`, `registrationType`, `validFrom/To`, `isActive` |
| `RegionGstRegistration` | `regionId`, `gstRegistrationId`, `isDefault`, `validFrom/To`. This is the many-to-many join. |

The design points:
- Transactions reference `GstRegistration` **directly**, never through region. Examples are `Project`, `PurchaseOrder`, `VendorInvoice`, `RaBill`, `SubcontractorBill`, `Payment` and `GstTransaction`. This keeps GST reports exact, even if region-to-GSTIN links change later.
- The service layer validates that the chosen GSTIN is linked to the record's region. The default is pre-filled from `isDefault`.
- A GSTIN can serve several regions, and a region can hold several GSTINs.
- There is no global "company" row. The legal entity is carried by `GstRegistration` (name and PAN), which also supports more than one legal entity if it ever comes up.

## 3.6 Tender → project conversion

**Tender-side models** (Phase 1):

| Entity | Notes |
|---|---|
| `TenderStage` | `name`, `sequence`, `kind` (OPEN / WON / LOST / NO_GO / TERMINAL), `systemKey?`, `isActive`. `kind` is how dashboards compute win rate. |
| `TenderStageTransition` | `fromStageId`, `toStageId`, `requiredPermissionId?`, `requiresReason`, `approvalFlowId?`. Makes the stage graph configurable, including which moves need approval. |
| `TenderResult` | Configurable results (Won / Lost / Cancelled / Retender / …) with an `outcome` enum (WON / LOST / NEUTRAL). |
| `TenderType` + `ChecklistTemplateItem` | Required-document template per tender type: `documentTypeId`, `isMandatory`, `sortOrder`. |
| `Tender` | `tenderNo`, `title`, `clientId`, `regionId`, `location`, `tenderTypeId`, `portalId?`, `sourceUrl`, `estimatedValue`, `emdAmount`, `tenderFee`, five date fields (publish, pre-bid, submission deadline, technical opening, financial opening), `currentStageId`, `resultId?`, `ownerId`, `gstRegistrationId?`. Unique on `(clientId, tenderNo)` among non-deleted rows. |
| `TenderStageHistory` | `fromStageId`, `toStageId`, `changedById`, `changedAt`, `reason`. Powers the timeline UI. |
| `GoNoGoDecision` | `decision`, `decidedById`, `decidedAt`, `reason` (required for NO_GO), `approvalRequestId`. Several rows are allowed, so reversals are visible. |
| `TenderDocumentItem` | A checklist instance on a tender: `name`, `documentTypeId`, `isMandatory`, `status`, `assigneeId`, `dueDate`. The file attaches via `DocumentLink`. |
| `SecurityInstrument` | EMD, PBG, additional PBG and security deposit in one model. Fields: `type`, `tenderId`, `projectId?`, `mode` (DD / BG / ONLINE / FDR / EXEMPTION), `amount`, `instrumentNo`, `bank`, `issueDate`, `expiryDate`, `status`. |
| `SecurityInstrumentEvent` | ISSUED / EXTENDED / REFUND_REQUESTED / REFUNDED / ADJUSTED / FORFEITED / RELEASED, each with `amount`, `date`, `reference` and an optional `paymentId`. It also records "EMD adjusted into PBG". "EMD locked" on the dashboard sums open instruments. |
| `Bid` | `tenderId`, `quotedAmount`, `percentVsEstimate` (stored), `submittedAt`, `technicalResult`, `financialRank`, `isL1`, `isFinal`. Revised bids are separate rows. |
| `BidClarification` | `bidId`, `request`, `requestedOn`, `dueDate`, `response`, `respondedOn`. |
| `CompetitorBid` | `tenderId`, `competitorName`, `amount`, `rank`, `isL1`. Optional, per the doc. |
| `TenderAward` | `tenderId` (unique), `loaNo`, `loaDate`, `awardedAmount`, `agreementNo`, `agreementDate`, `completionPeriodDays`, `startDate`, `conditionsNote`. |
| `AwardCondition` | `awardId`, `description`, `isMandatory`, `status`, `dueDate`. Covers PBG submitted, agreement signed and so on. This is the gate for conversion. |

**Conversion** (the "enter once" guarantee):

- `Project.tenderId` is **unique and nullable**, so one tender gives at most one project, and direct-award projects can exist without a tender.
- `ProjectConversion` is the provenance record: `tenderId`, `projectId`, `convertedById`, `convertedAt`, `snapshot Json` (the tender, bid and award values copied), `overrideReason?` and `approvalRequestId?`.
- The convert service runs in one transaction and does this:
  1. Checks that the stage is AWARDED or AGREEMENT_SIGNED and that all mandatory `AwardCondition`s are met. Otherwise it needs a Director override with a reason.
  2. Creates `Project`, copying `clientId`, `regionId`, `gstRegistrationId`, contract value (awarded or agreement value), dates and manager.
  3. Adds `DocumentLink` rows for the project to the same `Document` rows (no file copy).
  4. Sets `projectId` on the PBG `SecurityInstrument`s and records the EMD adjustment event.
  5. Moves the tender to CONVERTED_TO_PROJECT.
  6. Writes the audit entry.
- Contract value changes after award go through `ProjectContractRevision`: `projectId`, `revisionNo`, `value`, `endDate`, `reason`, `approvalRequestId`.

## 3.7 Subcontractor ↔ project (many-to-many)

- `Party` is the shared master: `name`, `gstin?`, `pan`, `address`, `stateId`, `contactName`, `phone`, `email`, `isActive`. It has `PartyBankAccount` (`bank`, `accountNo`, `ifsc`, `isPrimary`).
- `Subcontractor` is a profile with 1:1 on `Party`: `tradeCategoryId`, `isLabourSupplier`, `status` (including blacklisted).
- `Vendor` is another profile on `Party`. One legal entity can be both vendor and subcontractor with a single set of bank details.
- `SubcontractorWorkOrder` is the explicit junction. Its fields are `subcontractorId`, `projectId`, `siteId?`, `workOrderNo` (unique), `scope`, `contractValue`, `startDate`, `endDate`, `retentionPercent`, `status` and `approvalRequestId`.
  - It is an explicit table, not a bare join, because the doc puts per-assignment scope, value and rates here.
  - It also allows several work orders for the same subcontractor on the same project.
  - "Subcontractor A → Projects 1, 4, 7" is `SELECT DISTINCT projectId` over this table.
- `WorkOrderItem` holds the rates: `workOrderId`, `boqItemId?`, `description`, `unit`, `qty`, `rate`, `amount`.
- `SubcontractorCompliance` is `subcontractorId`, `type`, `periodMonth?`, `validTo`, `documentId`. It supports the labour-contractor compliance proof.

Bills and deductions:
- `SubcontractorBill` carries `workOrderId`, `projectId`, `gstRegistrationId`, `billNo`, `billDate`, `periodFrom/To`, `grossAmount`, tax split (`cgst`, `sgst`, `igst`), `netPayable`, `paidAmount`, `status` and `approvalRequestId`. Outstanding is derived.
- `SubcontractorBillItem` records this-bill quantity against cumulative quantity for each work-order item.
- `DeductionType` is a shared config table. Fields are `code`, `name`, `calcMethod` (PERCENT / FIXED / MANUAL), `defaultRate`, `appliesTo` (SUB_BILL / RA_BILL / BOTH) and `isReleasable`. Retention, TDS, advance recovery, material recovery and penalty are seed rows, not enums.
- `SubcontractorBillDeduction` links a bill to a `DeductionType`, with `amount`, `remarks` and an optional `advanceId` or `stockTransactionId`.
- `Advance` has direction GIVEN or RECEIVED, party or client, project, work order, amount, `paymentId` and `recoveredAmount`. It covers subcontractor advances and department mobilisation advances.
- `RetentionEntry` has side CLIENT or SUBCONTRACTOR, `projectId`, the work order or bill reference, `type` WITHHELD or RELEASED, `amount` and `date`. It tracks retention release later, from both directions.

## 3.8 Site-linked attendance

| Entity | Key fields |
|---|---|
| `Employee` | `code`, `name`, `phone`, `joiningDate`, `exitDate`, `labourTypeId`, `designationId`, `departmentId`, `homeRegionId`, `userId?` (unique), `contractorId?` (→ `Subcontractor`), PAN, UAN, ESIC no, bank, and Aadhaar stored encrypted or last-4 only. |
| `LabourType` | Configurable. `payrollMode` (MONTHLY / DAILY / CONTRACTOR) decides whether the employee is on payroll or paid via a contractor bill. |
| `Site` | `projectId`, `name`, `code`, `address`, `lat`, `lng`, `geofenceRadiusM`, `inchargeId`, `reportCutoffTime`, `defaultShiftId`, `status`. It also has `@@unique([id, projectId])` (see below). |
| `SiteAssignment` | `employeeId`, `siteId`, `projectId`, `role`, `fromDate`, `toDate`, `reason`, `assignedById`. Assignment history is the transfer log: a transfer closes one row and opens another. |
| `Shift` | `name`, `start`, `end`, `graceMinutes`, `isNight`. |
| `Attendance` | `employeeId`, `siteId`, `projectId`, `date`, `status` (PRESENT / ABSENT / HALF_DAY / LEAVE / HOLIDAY / WEEKOFF), `dayFraction` (1.0 or 0.5), `shiftId`, `checkInAt`, `checkOutAt`, `overtimeMinutes`, `overtimeApprovedById`, `source` (SUPERVISOR / SELF / BIOMETRIC / IMPORT), `markedById`, check-in `lat`, `lng`, `accuracy`, `withinGeofence`, `selfieDocumentId?`, `clientUuid`, `remarks`. |

Integrity design:
- `Attendance.siteId` and `projectId` form a **composite FK to `Site(id, projectId)`**. A row can never be tagged to a project that doesn't own the site, so labour cost per project is always trustworthy.
- Uniqueness is `(employeeId, date, siteId)`. An employee can split a day across two sites. The service enforces that `SUM(dayFraction) ≤ 1` per employee per day.
- Marking attendance requires an active `SiteAssignment` covering that date, or a flagged exception.
- Corrections after a payroll lock go through the approval engine. `PayrollRun` locks its period.
- Payroll writes `PayslipProjectAllocation` (`payslipId`, `projectId`, `siteId`, `days`, `amount`), so labour cost per project and site comes straight from attendance.
- Leave: `LeaveType`, `LeaveBalance`, `LeaveRequest` (with `approvalRequestId`), `Holiday` (`regionId?`, `date`).

---

# 4. Remaining domains

**Platform (Phase 0)**
- `Document`: `storageKey`, `fileName`, `mime`, `size`, `checksum`, `documentTypeId?`, `version`, `groupId` (for versions), `uploadedById`, `takenAt?`, `lat?`, `lng?` (photo metadata).
- `DocumentLink`: `documentId`, `entityType`, `entityId`. One file can be linked to a tender and then its project.
- `Comment`: polymorphic, with `entityType`, `entityId`, `authorId`, `body`.
- `Notification`: `userId`, `type`, `title`, `body`, `entityType`, `entityId`, `readAt`, `dedupeKey` (unique, so jobs can re-run safely).
- `NotificationRule`: `eventKey`, `regionId?`, `offsetDays Int[]`, `recipientType`, `channels`, `isActive`.
- `Setting`: `key`, `value Json`, `regionId?`.
- `NumberSeries`: `key`, `gstRegistrationId?`, `financialYear`, `prefix`, `nextNumber`.
- `UserPreference` (remembered filters), plus masters: `Unit`, `Department`, `Designation`, `ExpenseCategory`, `DocumentType`, `TradeCategory`, `ProjectStatus`, `HealthRule`, `Client`.
- `Client` has `name`, `gstin?`, `address`, `stateId` and a self-referencing `parentId` (for example PWD → Division).

**Projects & daily work (Phase 2)**
- `Project`: `code`, `name`, `tenderId?` (unique), `clientId`, `regionId`, `gstRegistrationId`, `contractValue`, `startDate`, `plannedEndDate`, `statusId`, `projectManagerId`, `healthOverride?`.
- `ProjectMember`: `projectId`, `employeeId`, `roleId`, `fromDate`, `toDate`.
- `ProjectHealthSnapshot`: `projectId`, `date`, `status` (GREEN / AMBER / RED), `reasons Json`. This gives trend charts.
- `BoqItem`: `projectId`, `parentId?`, `itemNo`, `description`, `unitId`, `quantity`, `rate`, `amount`, `executedQty` (cached).
- `ProjectBudgetLine`: `projectId`, `expenseCategoryId`, `plannedAmount`.
- `DailyWorkReport`: `siteId`, `reportDate`, `status` (DRAFT / SUBMITTED / REVIEWED), `workersCount`, `issues`, `planForTomorrow`, `submittedById`, `reviewedById`, `reviewComment`, `clientUuid`. Unique `(siteId, reportDate)`.
- `DailyWorkItem`: `reportId`, `boqItemId`, `plannedQty`, `completedQty`. Progress % is derived.
- `DailyEquipmentUsage`: `reportId`, `equipmentTypeId`, `qty`, `hours?`.
- `SiteIssue`: `siteId`, `reportId?`, `title`, `severity`, `status`, `raisedById`, `resolvedAt`. Feeds "major issues" on the dashboard.
- Photos use `DocumentLink`. Missing-report detection is a job: active sites with no submitted report past `reportCutoffTime`.

**Purchases (Phase 5)**
- `PurchaseRequest` plus `PurchaseRequestItem`: `projectId`, `siteId`, `requestedById`, `neededBy`, `approvalRequestId`.
- `Quotation` plus `QuotationItem`: `vendorId`, `isSelected`, `validTill`.
- `PurchaseOrder` plus `PurchaseOrderItem`: `gstRegistrationId`, `vendorId`, `projectId`, `siteId`, number from `NumberSeries`, `approvalRequestId`.
- `GoodsReceipt` plus `GoodsReceiptItem`: ordered, received, accepted and rejected quantities.
- `VendorInvoice` plus `VendorInvoiceItem`: `gstRegistrationId`, `placeOfSupplyStateId`, HSN, taxable value, CGST/SGST/IGST/cess, `itcEligible`, and PO and GRN links for a three-way match.
- `Material` (with HSN) and `StockTransaction` (`siteId`, `materialId`, `type` RECEIPT / ISSUE / CONSUMPTION / RETURN / TRANSFER / ADJUSTMENT / WASTAGE, `qty`, `rate`, plus optional links to a GRN item, daily report, BOQ item or work order). Balance is derived by a view.

**Payroll (Phase 6)**
- `WageComponent`: `code`, `type` (EARNING / DEDUCTION / EMPLOYER), `calcType`, `epfApplicable`, `esiApplicable`.
- `SalaryStructure` plus `SalaryStructureLine`: effective-dated per employee.
- `EpfRule`, `EsiRule`, `ProfessionalTaxSlab` (`stateId`) and `OvertimeRule`: effective-dated and typed. They are settings, not code.
- `StatutoryRegistration`: `type` (EPF / ESIC / PT), `number`, `regionId` or `stateId`. EPF export needs the establishment code.
- `PayrollRun`: `periodMonth`, `regionId?`, `status`, totals, `lockedAt`, `approvalRequestId`.
- `Payslip` plus `PayslipLine`: EPF and ESI figures are snapshotted on the payslip. `PayslipProjectAllocation` is described in §3.8.
- `EpfExport`: `runId`, `documentId`, `generatedAt`.

**Accounts, billing & GST (Phase 7)**
- `RaBill`: `projectId`, `gstRegistrationId`, `billType` (RA / FINAL / ESCALATION / SUPPLEMENTARY), `billNo`, `periodFrom/To`, gross (this bill and cumulative), tax split, `certifiedAmount?`, `netPayable`, `status`, `invoiceNo`, `invoiceDate`.
- `RaBillItem`: `boqItemId`, previous / this / cumulative quantity, `rate`.
- `RaBillDeduction`: `deductionTypeId`, `amount`, `advanceId?`. Retention, income-tax TDS, GST TDS, labour cess and LD are all `DeductionType` rows.
- `Payment`: `direction` (IN / OUT), `purpose` (RA_RECEIPT / EMD / EMD_REFUND / PBG / SALARY / SUBCONTRACTOR / VENDOR / EXPENSE / TENDER_FEE / TAX), `amount`, `paidOn`, `mode`, `utr`, `companyBankAccountId`, counterparty (`partyId` or `clientId`), `projectId?`, `siteId?`, `gstRegistrationId?`, `regionId`, `expenseCategoryId?`, `approvalRequestId?`.
- `PaymentAllocation`: `paymentId`, `amount`, and exactly one of `raBillId`, `subcontractorBillId`, `vendorInvoiceId`, `payslipId`, `securityInstrumentEventId`, `retentionEntryId`. Any unallocated remainder is treated as an advance.
- `CompanyBankAccount` and `Expense` (petty and site expenses with receipt and approval).

**Read models, rebuildable from source documents**
- `CostEntry`: `projectId`, `siteId`, `categoryId`, `kind` (COMMITTED / ACTUAL), `sourceType` and `sourceId`, `amount`, `date`. Services write it in the same transaction as the PO, bill, payslip allocation or expense. Budget-vs-actual then needs one query, not six.
- `GstTransaction`: `gstRegistrationId`, `direction` (OUTWARD / INWARD / TDS_RECEIVED), source reference, party GSTIN, place of supply, taxable value, CGST/SGST/IGST/cess, `itcEligibility`, `period`, `invoiceNo`, `invoiceDate`, `hsn`. This feeds per-GSTIN exports directly. It is a read model, so the source tables stay authoritative.

---

# 5. Notable decisions and trade-offs

1. **Employee as the single "person" record.** It covers directors, staff, daily-wage workers and contractor labour. A `User` is an optional login on top.
2. **Labour contractors are `Subcontractor`s** flagged `isLabourSupplier`. Contractor labour is paid through `SubcontractorBill`, as the doc says, with no separate contractor entity.
3. **Two denormalised read models** (`CostEntry`, `GstTransaction`) trade some write complexity for fast dashboards and clean GST exports. If you'd rather avoid duplicated data, the alternative is database views over the sources. They'd be slower and harder to index.
4. **Polymorphic links** are limited to documents, comments, audit, approvals and notifications. They are never used for money.
5. **Executed quantity** has two sources. Daily reports give indicative site progress, and RA bill measurements are the official figure. `BoqItem.executedQty` caches the former, and RA bills hold the latter.
6. **Estimated size:** about 120 models. Phase 0 and 1 together are about 55. The phase map in CLAUDE.md still applies. Later-phase tables can be added by migration without touching earlier ones.

---

# 6. Open questions — defaults ACCEPTED on 2026-10-07

Each default below was accepted for now. Revisit before the database phase.

1. **GSTIN rules.** Can one GSTIN cover several regions, and can a region hold several GSTINs? Who picks the GSTIN on a new tender or project? *Default: many-to-many, the region's default pre-selected, the tender owner can change it.*
2. **Legal entities.** Is there only one company (one PAN)? *Default: yes, and no separate company table.*
3. **Hierarchy participants.** Does every person in the chain, including directors, get an `Employee` record? *Default: yes, with payroll disabled where it doesn't apply.*
4. **Project-level roles.** Does a role assigned on `ProjectMember` grant extra permissions inside that project, or does it only describe the person? *Default: it describes the person only. Permissions come from global roles with scope.*
5. **Approval rules.** Are thresholds based on amount only, or also on region and type? Do you need parallel (ALL) approvers, delegation, and re-approval when an approved record is edited? *Default: amount plus region, ANY/ALL both supported, delegation included, and re-approval on edits to approved amounts.*
6. **Audit scope.** Do you want read-access auditing for sensitive records (salary, bank details)? Is a hash chain needed for tamper evidence? *Default: write audit only, no hash chain.*
7. **BOQ timing.** Is a priced BOQ prepared at the bid stage? *Default: BOQ lives on the project only, entered or imported at conversion. If you need it at tender stage, add a `Boq` header owned by either tender or project.*
8. **Tender → project shape.** Can one tender produce several projects (packages or lots)? Do JV or consortium bids exist? Are there projects with no tender? *Default: one tender gives at most one project, no JV, direct-award projects allowed.*
9. **Attendance granularity.** Is attendance recorded per named worker, or as a headcount for daily-wage and contractor labour? This is the biggest schema driver. *Default: per named worker. Contractor labour is headcount-only unless told otherwise, so add a `ContractorHeadcount` entry per site per day.*
10. **Attendance rules.** Is the geofence mandatory or advisory? Will biometric devices be integrated? *Default: advisory flag, with import support for biometric later.*
11. **Payroll scope in Phase 6.** Are ESI, professional tax, LWF, bonus, gratuity and salary advances needed? *Default: EPF, ESI and PT only.*
12. **Accounting integration.** Is a Tally export planned, and does it need ledger or GL codes on categories and deduction types? *Default: add an optional `glCode` to `ExpenseCategory` and `DeductionType` now, since it's cheap.*
13. **Subcontractor billing.** Are bills measured against BOQ quantities or lump-sum milestones? *Default: item-based, with a lump-sum line allowed.*
14. **Site stock.** Is inter-site transfer or a central store needed, and what valuation method? *Default: site-level only, weighted average, transfers supported.*
15. **IDs and offline.** Are client-generated string IDs on daily reports and attendance acceptable for offline retry? *Default: yes.*
16. **Retention.** How long do audit and attachments need to be kept, and are archive or partition policies needed? *Default: indefinite, with monthly audit partitions.*
