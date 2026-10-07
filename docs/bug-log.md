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
