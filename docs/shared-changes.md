# Shared changes requested

## build/s1-loaders-phase67

- Barrel: server loaders live in `src/lib/data/server/` (`load-finance.ts`, `load-workforce.ts`, `row-mapper.ts`) and are server-only, so they are not exported from `src/lib/data/index.ts`. Merge with any other agent's `row-mapper`/loader helpers (`mapRow`, `toMoney`, `LoadScope`) rather than duplicating.
- `next.config.ts`: added `env: { NEXT_PUBLIC_APP_ENV: process.env.APP_ENV }` so the client sees APP_ENV for `src/lib/features.ts`.
- Real auth/session: loaders take a `LoadScope` ({ regionIds, projectIds }) that the caller derives from `scopeFilter(user, module)`. GST transactions are not region-scoped (keyed by GSTIN); filter by the user's allowed GSTINs when auth lands.
- Flag `PHASE67_ENABLED` hides nav, /employees/** and /finance/** (404 via layouts) and the dashboard widgets. `getDashboard()` still computes all 13 figures (tests rely on it); only the UI is gated.

All Wave A requests were applied in 28da281. Open items from them are listed in `docs/audit-report.md` (Wave A status).
