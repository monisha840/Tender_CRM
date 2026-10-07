# Shared changes requested

All Wave A requests were applied in 28da281. Open items from them are listed in `docs/audit-report.md` (Wave A status).

## S1 loaders (parties / approvals / platform)
- `Database` (src/types/database.ts) has no tables for: approvalFlows, approvalFlowLevels, approvalThresholds, partyBankAccounts, settings, numberSeries. The loaders return them as extra keys (record types exported from `src/lib/data/server/load-approvals.ts`, `load-parties.ts`, `load-platform.ts`). Promote to `Database` if screens need them.
- Barrel: export `src/lib/data/server/*` only from server-only code (it imports `@prisma/client` types); do not add to `src/lib/data/index.ts`.
- `LoadScope` type lives in `src/lib/data/server/convert-platform.ts`; other loader agents may define the same shape, unify when merging.
## S1 loaders: org + access (build/s1-loaders-access)

- `src/types/access.ts`: `PermissionScope` lacks `OWN_RECORDS` and `PermissionAction` lacks `DELETE`/`REVIEW` (Prisma has them). The loader maps OWN_RECORDS -> OWN_SITES and omits DELETE/REVIEW permissions. Proposed: add the three values to the types (and to `SCOPE_RANK` in `src/lib/data/access.ts`, OWN_RECORDS below OWN_SITES) so the snapshot is lossless.
- `src/types/database.ts`: no table for `ApprovalThreshold`; `loadApprovalThresholds` returns it separately via `loadDatabaseForUser().approvalThresholds`. Optionally add `approvalThresholds` to `Database`.
- `src/lib/data/server/compose.ts`: `DEFAULT_LOADERS` is empty until load-tenders/projects/sites/parties/approvals/platform/finance/workforce merge; follow the TODO in that file to wire the imports (convention: `load<Name>(prisma, ctx?)`). `projectMembers` is also loaded by `loadAccess`; the later registry slice wins on duplicates.
- Shared mapping helpers (`isoDate`, `isoDateTime`, `money`, `base`, `LIVE`, `STABLE_ORDER`) are in `src/lib/data/server/map-common.ts`; sibling loaders may reuse them.
