# Data model (Prisma) — Phase 1 + core platform

Source of truth: `prisma/schema.prisma` (81 models, Prisma 6.19, PostgreSQL on Supabase). This page is the human summary.
The long-range proposal stays in `docs/data-model-full.md`; where they differ, this page and the schema win.

Status: **schema designed and validated; no migration has been run.** Waiting for the checkpoint approval.

## Conventions

| Concern | Decision |
|---|---|
| Access | Prisma only, server-side, via `DATABASE_URL`. supabase-js is for Auth and Storage only. |
| IDs | `String @default(cuid())`. Seed rows use readable ids (`reg_cg`, `stg_won`). |
| Money / qty / % | `Decimal(14,2)` / `Decimal(14,3)` / `Decimal(7,4)`. Pure dates `@db.Date`; timestamps UTC. |
| Common columns | `createdAt, updatedAt, createdById, updatedById, deletedAt, version` on business tables (`version` = optimistic lock). `createdById`/`updatedById` are plain strings (a `users.id`), not FKs. |
| Append-only | `AuditLog`, `ApprovalAction`, `TenderStageHistory`, `SecurityInstrumentEvent`. UPDATE/DELETE on the first two blocked by a trigger in the raw-SQL migration. |
| RLS | Raw-SQL migration enables RLS on **every** table with no policies (the public key reads nothing; Prisma connects as the DB owner and bypasses RLS). |
| Scope columns | `regionId` / `projectId` / `siteId` are denormalised on transactional tables so scoped reads and region dashboards need no joins. |
| Enums | Only fixed technical states. Stages, results, statuses, deduction types, roles, permissions, flows are tables. |
| Soft-delete uniques | Plain `@@unique` in Prisma; "unique among non-deleted" partial indexes are added in the raw-SQL migration. |

## Entities by area

**Organisation:** State, Region, Office, GstRegistration (unique `gstin`), RegionGstRegistration (many-to-many, `isDefault`), Organisation (customer PSU; self-parent), ServiceLine.

**Users and access:** `User` (`authUserId` unique uuid = Supabase Auth id, nullable for demo users, `email`, `isActive`, `mustChangePassword`), `Role` (`key`, `layout` OFFICE|SITE, `homePath`), `Permission` (`module` + `action`, unique), `RolePermission` (`scope` ALL | OWN_REGION | OWN_PROJECTS | OWN_SITES | OWN_RECORDS), `UserRole`, `UserRegion` (a Regional Head can hold several), `ApprovalThreshold` (`flowId`, `roleId`, `maxAmount`).
Project membership is `ProjectMember` (`projectId`, `employeeId`); a user reaches it via `Employee.userId`. Project manager = `Project.projectManagerId` (Employee).

**People (Phase 3, present for the data layer):** Employee (unique `userId`), EmployeeProfile (wage, PF/ESI flags, UAN), LabourType.

**Masters and config:** TenderStage (`kind`, `systemKey`), TenderResult, TenderType, TenderPortal, DocumentType, ChecklistTemplateItem (default checklist per tender type), ProjectStatus, ExpenseCategory, DeductionType (retention/TDS/advance as rows), Material, Setting (key/value JSON, optional region), NumberSeries.

**Platform:**
- `AuditLog`: BigInt id, `actorId/actorType`, `action`, `entityType/entityId`, `regionId/projectId`, `summary`, `before/after` JSON, `changedFields[]`, `reason`, `approvalRequestId`, `requestId`, `ip`.
- Approvals: `ApprovalFlow` (`key`, `entityType`) -> `ApprovalFlowLevel` (ordered candidate approver roles) ; `ApprovalRequest` (polymorphic `entityType/entityId`, `amount`, `regionId`, `status`) -> `ApprovalStep` (materialised at submit) -> `ApprovalAction` (append-only).
- `Notification` (`dedupeKey` unique so jobs re-run safely, `readAt`, `emailedAt`).
- `Document` (private Storage bucket + `storageKey`, size, checksum, photo lat/lng) and `DocumentLink` (entityType/entityId; one file can link to a tender then its project).

**Tenders:** Tender (unique `(organisationId, tenderNo)`; `currentStageId`, `ownerId`, `gstRegistrationId`, deadlines, `estimatedValue/emdAmount/tenderFee`), TenderStageHistory, GoNoGoDecision (`approvalRequestId`), TenderDocumentItem, SecurityInstrument (EMD/PBG/additional PBG/SD; `projectId` set on conversion) + SecurityInstrumentEvent, Bid, BidClarification, CompetitorBid, TenderAward (1:1), AwardCondition (conversion gate).

**Projects:** Site (plant site), Project (1:1 optional `tenderId`; `contractType`, `billingCycle`, `paymentTermsDays`, `contractValue`; **clause fields**: `jurisdiction`, `escalationType`, `ldPercent`, `pbgPercent`, `securityDepositPercent`, `retentionPercent`, `defectLiabilityMonths`, `sublettingAllowed`, `deploymentNorms`, `clauseNotes`), ProjectConversion (provenance + snapshot), ProjectMember, ProjectProgressSnapshot, BoqItem (unique `(projectId, itemNo)`), ProjectBudgetLine, CostEntry (budget-vs-actual read model).

**Daily reports:** DailyWorkReport (unique `(siteId, projectId, reportDate)`, `clientUuid` for offline retry), DailyWorkItem, SiteIssue.

**Subcontractors:** Party (+ PartyBankAccount), Subcontractor, Vendor, **SubcontractorWorkOrder** (the hub/junction: subcontractor x project, `approvalRequestId`), SubcontractorBill (unique `(workOrderId, billNo)`, `netPayable`, cached `paidAmount`, `approvalRequestId`), SubcontractorBillDeduction.

**Phase 2/3 tables (exist in `src/types`, no screens yet):** Invoice, InvoiceDeduction, Payment (explicit nullable FKs for allocation), RetentionEntry, GstTransaction, SiteAssignment, Attendance, PayrollRun, Payslip, PurchaseRequest(+Item), PurchaseOrder, VendorInvoice, StockTransaction.

## Key relations

```
Region 1-n Tender / Project / Site / bills / reports        GstRegistration n-n Region (RegionGstRegistration)
Tender 1-n Stage history, GoNoGo, DocumentItem, Instrument, Bid     Tender 1-1 Award 1-n AwardCondition
Tender 1-0..1 Project (Project.tenderId unique)  via ProjectConversion (snapshot)
Project 1-n BoqItem, Member, DailyWorkReport, WorkOrder, Instrument, Invoice, Payment
Subcontractor 1-n WorkOrder n-1 Project;  WorkOrder 1-n Bill 1-n Deduction, Payment
Role 1-n RolePermission(scope) n-1 Permission;  User n-n Role (UserRole), n-n Region (UserRegion)
ApprovalFlow 1-n Level (role) + Threshold (flow, role, maxAmount);  Request 1-n Step 1-n Action
```

## Approval routing (thresholds as data)

A flow lists candidate approver roles in order (`ApprovalFlowLevel`). `ApprovalThreshold(flow, role)` is the highest amount that role may finally approve; no row means unlimited. The engine picks the first level whose role can cover the amount (Regional Head levels also require the request's region in the approver's regions); maker-checker applies unless `allowSelfApproval`.
Seeded: GO_NO_GO and TENDER_CONVERSION (Regional Head up to ₹1 Cr tender value), WORK_ORDER and SUB_BILL (Regional Head up to ₹10 L), SUB_PAYMENT (Director only).

## Seeds

- `prisma/seed-base.ts`: states, 4 regions, 4 offices, 4 GSTINs (placeholders, see below) + region links, service lines, six tender stages, results, tender types, document types + default checklist, project statuses, expense categories, deduction types, labour types, the 6 roles, permission catalogue (18 modules x 10 actions) and the go-live-plan 2.2 grants, approval flows/levels/thresholds, reminder settings. Idempotent upserts. No users.
- `prisma/seed.ts` (`prisma db seed`): runs base; with `SEED_DEMO=true` also ports the deterministic mock seed (about 150 employees, tenders, projects, invoices ...) and a demo System Admin. Refuses when `APP_ENV=production`.
- Neither has been run.

## Deviations from `data-model-full.md` / types (and why)

- `PermissionAction` gains `DELETE` and `REVIEW`; `PermissionScope` gains `OWN_RECORDS` (matrix needs soft-delete, PM report review, "own requests/notifications").
- `DailyWorkReport` is unique per `(siteId, projectId, reportDate)` not `(siteId, reportDate)`, because several projects run at one plant site.
- Approval thresholds live in `ApprovalThreshold` (single source) instead of min/max amounts on flow levels.
- `Document` keeps its own document-family `version`, not the optimistic-lock counter.
- `Region` has no hard link from `User` other than `UserRegion`. No `Account/Session` tables: Supabase Auth owns sessions.
