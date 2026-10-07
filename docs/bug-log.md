# Bug log (E2E smoke)

| ID | Test | Expected vs actual | Severity | Verdict / fix | Status |
|---|---|---|---|---|---|
| BUG-S1 | setup / auth specs | Login within 5s; cold `next dev` compile of /dashboard took longer, "Signing in..." still pending | Low | WRONG TEST: login waits 45s (setup + `loginViaUi`) | Fixed |
| BUG-S2 | auth: sign out | Fixture failed on `requestfailed ... net::ERR_ABORTED` (navigation / `_rsc` prefetch aborted by navigation) | Low | WRONG TEST: fixture ignores ERR_ABORTED only for navigation requests and `?_rsc=` URLs | Fixed |
| BUG-S3 | auth: sign out | Console error "Base UI: ... nativeButton prop is false" from Sign out menu item | Low | APP BUG: `nativeButton` added to the sign-out `DropdownMenuItem` (user-menu.tsx) | Fixed |
| BUG-S4 | crawl admin, later specs | Admin bounced to /login: sign-out (`supabase.auth.signOut()`, global scope) revokes every session of that user, incl. the saved admin storage state; concurrent specs from other runs can do the same to the director | Medium | WRONG TEST ORDER: auth.spec re-logs in as admin in `afterAll` and rewrites the saved state. App sign-out scope NOT changed (security-sensitive; left for the user: `scope: "local"` would stop sign-out on one device from logging out all devices). Director session can still be revoked if another run signs out concurrently | Fixed (test) / Open (product decision) |
| BUG-S5 | crawl | Console "hydration mismatch ... style caret-color: transparent" | Low | WRONG TEST: Playwright `screenshot` hides the caret by injecting a style; `caret: "initial"` | Fixed |
| BUG-S6 | crawl detail pages | Next 16 "encountered URL data during prerendering" on /tenders/[id], /projects/[id] (and /subcontractors/[id]): `await params` outside Suspense | Medium | APP BUG: read `params` inside `<Suspense>` in the three detail pages | Fixed |
| BUG-S7 | dashboard KPI | Read "1" instead of 19: tile label is "1. Active tenders" and the regex matched the label number | Low | WRONG TEST: strip the `<n>. ` prefix before parsing. KPI value (19) matches the DB | Fixed |
| BUG-S8 | mobile /tenders at 360px | `getByRole("row")` matched the hidden desktop table first; the visible mobile cards (TenderCards) have no testid (docs/e2e-testids.md says `tender-row` for cards) | Low | WRONG TEST: assert the first listitem of the visible "Tender register" list. Known issue: add `data-testid="tender-row"` to TenderCards items (src/components/tenders, other agent's area) | Fixed (test) / Open (testid) |
| BUG-S9 | infra | Prisma "Can't reach database server" when several dev servers share the session-mode pooler (port 5432) | Info | Run with `?connection_limit=3` appended to DATABASE_URL in the shell env (no code change) | Workaround |
| SCOPE | crawl | Crawl reduced per client cut to Dashboard, Tenders, Projects, Subcontractors, Approvals + deadlines and detail pages | - | `tests/e2e/helpers/routes.ts` | Done |
# Bug log (smoke suite)

| ID | Test | Expected vs actual | Severity | Fix | Status |
|---|---|---|---|---|---|
| TF-1 | tender-flow 1 | Form helper matched the list filters behind the Add-tender sheet (Organisation/Region); click intercepted. WRONG TEST: helpers now scope fields to the dialog. | test | tests/e2e/helpers/{ui,tender-flow}.ts | fixed |
| TF-2 | tender-flow 1 / rbac | Request GO is only offered in Under Evaluation; a New tender first needs "Move to Under Evaluation". WRONG TEST: `requestGo` / `advanceToSubmitted` helpers follow the real workflow. | test | tender-flow.ts | fixed |
| TF-3 | tender-flow 2 / rbac | APP BUG: approvals inbox decided locally in the browser store (no server action; DB never changed). Now calls decideApprovalAction, then router.refresh(); added approvals-row/approve/reject/dialog-confirm test ids. | high | approvals-inbox.tsx | fixed |
| TF-4 | rbac / tender-flow | APP BUG: "Waiting for me" matched assignedUserId only; server steps are assigned to the Director ROLE, so the Director's tab was empty. | high | approvals-inbox.tsx | fixed (not yet verified end-to-end) |
| TF-5 | rbac / tender-flow | APP BUG: approval title lacked the tender number (docs/e2e-testids.md requires it). | medium | modules/tenders/service.ts | fixed (not yet verified) |
| TF-6 | tender-flow | APP BUG: /tenders/[id] read params outside Suspense (Next instant-shell console error). | medium | app/tenders/[id]/page.tsx | fixed |
| TF-7 | all | ENV: e2e-users global setup reset the password on every run, revoking live sessions of concurrent runs (random redirects to /login). Now only when sign-in fails. | high | scripts/e2e-users.ts | fixed |
| TF-8 | all | ENV: parallel agents exhaust the session pooler (prisma "Can't reach database"); run with connection_limit=3. | env | n/a | workaround |
| TF-9 | tender-flow 1, rbac | OPEN: console "useInsertionEffect must not schedule updates" on /tenders/[id] plus ERR_ABORTED RSC requests for /tenders/<id>, flagged by the console/network fixture. Source not found yet. | high | | open |
| SC-1 | scope cut | Approvals inbox, bell and dashboard attention show only TENDER_GO_NO_GO / TENDER_CONVERSION (listApprovals filter); local-only "New request" removed. | scope | lib/data/approvals.ts | done |
