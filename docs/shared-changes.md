# Shared changes requested

All Wave A requests were applied in 28da281. Open items from them are listed in `docs/audit-report.md` (Wave A status).

## S1 loaders (parties / approvals / platform)
- `Database` (src/types/database.ts) has no tables for: approvalFlows, approvalFlowLevels, approvalThresholds, partyBankAccounts, settings, numberSeries. The loaders return them as extra keys (record types exported from `src/lib/data/server/load-approvals.ts`, `load-parties.ts`, `load-platform.ts`). Promote to `Database` if screens need them.
- Barrel: export `src/lib/data/server/*` only from server-only code (it imports `@prisma/client` types); do not add to `src/lib/data/index.ts`.
- `LoadScope` type lives in `src/lib/data/server/convert-platform.ts`; other loader agents may define the same shape, unify when merging.
