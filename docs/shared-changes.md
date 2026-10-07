# Shared changes requested

## build/s1-loaders-phase67

- Barrel: server loaders live in `src/lib/data/server/` (`load-finance.ts`, `load-workforce.ts`, `row-mapper.ts`) and are server-only, so they are not exported from `src/lib/data/index.ts`. Merge with any other agent's `row-mapper`/loader helpers (`mapRow`, `toMoney`, `LoadScope`) rather than duplicating.
- `next.config.ts`: added `env: { NEXT_PUBLIC_APP_ENV: process.env.APP_ENV }` so the client sees APP_ENV for `src/lib/features.ts`.
- Real auth/session: loaders take a `LoadScope` ({ regionIds, projectIds }) that the caller derives from `scopeFilter(user, module)`. GST transactions are not region-scoped (keyed by GSTIN); filter by the user's allowed GSTINs when auth lands.
- Flag `PHASE67_ENABLED` hides nav, /employees/** and /finance/** (404 via layouts) and the dashboard widgets. `getDashboard()` still computes all 13 figures (tests rely on it); only the UI is gated.

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

## S1b unification (applied)
- `LoadScope` ({regionIds, projectIds, siteIds, includeDeleted}) and all row conversion helpers now live only in `src/lib/data/server/convert.ts` (convert-platform.ts and map-common.ts removed; row-mapper.ts keeps only the spec-driven `mapRow`). `money()` uses `toFixed(2)` (the old map-common `toString()` dropped trailing zeros).
- `PermissionScope` gained `OWN_RECORDS`, `PermissionAction` gained `DELETE` and `REVIEW`; load-access maps both losslessly. `Database.approvalThresholds` added (empty in the seed and in `emptyDatabase`).
- `Project` gained the optional clause fields; `BaseEntity` gained optional `version`, `createdById`, `updatedById`, `clientUuid` (set by the loaders when present).
- `DEFAULT_LOADERS` in `compose.ts` is wired with all 8 slots; `loadDatabaseForUser` derives a `LoadScope` from the user context (`scopeFromContext`) and passes it to every loader. `mergeSlices` keeps only `Database` keys (extra slice keys such as approvalFlows/settings are dropped from the snapshot).
- Open: extra non-Database slice keys (approvalFlows, approvalFlowLevels, settings, numberSeries, partyBankAccounts) are not exposed by `loadDatabaseForUser`.
- T1 (e2e foundation): added `@playwright/test`, `@axe-core/playwright`; `playwright.config.ts`, `tests/e2e/**`, `scripts/e2e-users.ts`, scripts `test:e2e`, `test:e2e:report`, `e2e:users`. Vitest now excludes `tests/e2e/**`. The shared dev DB is reset by every e2e run (and db:reset): concurrent runs from several worktrees cause FK errors in seeds; run one at a time. Login UI selectors (labels Email/Password, button "Sign in", route /login) are assumptions in `tests/e2e/auth.setup.ts` and `helpers/pages.ts`.


## S2 auth (build/s2-auth)
- Auth lives in `src/lib/auth/` (session.ts: `getSessionUser`, `getSessionContext`, `requireUser`, `requireUserForAction`; actions.ts: login/logout/forgot/reset/change-password server actions; rate-limit.ts; public-paths.ts; dev-flags.ts; persona-map.ts). `src/proxy.ts` (Next 16 name for middleware) refreshes the Supabase session and redirects anonymous requests to /login. `SessionUser` is unchanged.
- Pages: /login, /forgot-password, /reset-password (reached via /auth/callback code exchange), /change-password (when `User.mustChangePassword`), /auth/signout (GET, clears a session with no usable CRM profile). Root `/` redirects by auth state. Login limit: 5 failed attempts / 15 min per IP+email, in-memory.
- Shell: root layout wraps children in `SessionGate` (server) -> `SessionProvider` (client context, `useAuthUser()`) -> `AppShell`; login/password pages render without the shell. Header shows `UserMenu` (name, role, Sign out).
- Mock-data bridge (until S3 swaps screens off Zustand): `useCurrentPersona()` derives the persona from the logged-in user via `resolvePersonaUserId` (same email as a seed user, else role: director -> usr_stalin, system_admin -> usr_tender1, else first seed user). The persisted `currentUserId` is only honoured when the dev role switcher is on. S3 agents should read the real user from `getSessionUser()` on the server, not the persona.
- Dev role switcher: only when `NEXT_PUBLIC_DEV_ROLE_SWITCHER=true` and APP_ENV is not production (`next.config.ts` now always defines `NEXT_PUBLIC_DEV_ROLE_SWITCHER` so the bundler folds the check; with it off the role-switcher code is absent from the build, verified by grepping `.next`).
- Needs from the permission/audit layer: `changePasswordAction`/`resetPasswordAction` clear `User.mustChangePassword` with a bare Prisma update; wrap with the audit helper once it exists. Zod is not a declared dependency yet, so the auth actions validate by hand; swap to Zod when it is added.
- Dev note: with `cacheComponents`, `getSessionContext` calls `await connection()` first because supabase-js reads `Date.now()` while loading the session.
