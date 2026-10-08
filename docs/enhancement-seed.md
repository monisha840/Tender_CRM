# Enhancement seed

`prisma/seed-enhancement.ts` loads the data the enhancement modules need. Run it AFTER the additive migration
`20261008100000_enhancement_release` has been applied (`npm run db:deploy`) and after `db:seed:base`.

```bash
npm run db:seed:enhancement
```

- Idempotent and additive: looks rows up by natural key and creates only what is missing. It never updates, deletes or
  truncates (the one exception: it fills `TenderStage.color` where it is null).
- It does NOT call `assertNotProductionDb`; it is meant to run against the shared database. If the new tables or
  `TenderStage.color` are missing it prints a message and exits with code 1 without touching anything.
- Pure data builders are exported and unit-tested without a DB: `tests/unit/seed-enhancement.test.ts`.

## What it creates

| Area | Rows |
|---|---|
| Permissions | modules `money_locked`, `contract_pnl`, `documents`, `bill_readiness`, `gate_reconciliation`, `bid_pricing`, one row per action (as seed-base). `system_admin`: VIEW on money_locked/contract_pnl, VIEW/CREATE/EDIT/DELETE on documents, VIEW/CREATE/EDIT on the rest. `director`: VIEW on all. Scope ALL. |
| StatutoryRate | PF_EMPLOYER 12, PF_WAGE_CEILING 15000, ESI_EMPLOYER 3.25, ESI_EMPLOYEE 0.75, ESI_WAGE_CEILING 21000, BONUS 8.33, GST_DEFAULT 18 (effective 2025-04-01); MIN_WAGE per day for unskilled / semi-skilled / skilled effective 2025-04-01 and 2026-04-01. All `sourceNote` say "demo/indicative, verify against current notification". |
| Setting (regionId null, only if key absent) | reminders.deadlineDays [7,3,1], reminders.documentExpiryDays [60,30,7], reminders.moneyLockedExpiryDays [30,15,7], health.amberDelayPct 5, health.redDelayPct 15, billing.defaultGstPct 18, billing.paymentTermsDays 30, pnl.lowMarginPct 10, gate.hoursToleranceHrs 0.5, `features.<m>.enabled` true for money_locked, contract_pnl, documents, bill_readiness, gate_reconciliation, bid_pricing, statutory_rates, tender_stage_colors, health_thresholds |
| DocumentType | GST certificate, PAN, ISO 9001, Udyam / MSME, PF registration, ESI registration, Labour licence, Solvency certificate, Experience certificate, DSC. Existing equivalents (GST registration certificate, PAN card, Contract labour licence, Solvency certificate, Experience certificates) are reused, not duplicated. |
| CompanyDocument | 10 demo rows (ids `cdoc_enh_*`), dates relative to the run date. Most valid; Solvency (+20 days) and DSC (+25 days) expire soon; the **Contract labour licence is deliberately EXPIRED** (12 days ago) as the demo of the Submitted-block (noted in its `notes`). |
| ChecklistTemplateItem | GST, PAN and Labour licence added as mandatory for every tender type, only where that pair is absent. |
| BillReadinessTemplateItem | WAGE_REGISTER, PF_CHALLAN, ESI_CHALLAN, ATTENDANCE_SHEET, BANK_WAGE_PROOF, LABOUR_LICENCE_VALID (all mandatory). |
| BillReadinessCheck | previous month for the first two projects (by code): first fully done (Ready), second missing bank proof and labour licence (Blocked). |
| TenderStage.color | only where null: New neutral, Under Evaluation warning, Bid Preparing accent, Submitted info, Won success, Lost danger (token names). |

The output lists how many rows were newly created per area; a second run prints zeros.
