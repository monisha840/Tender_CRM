# E2E test id contract

The Playwright smoke specs (`tests/e2e/smoke/`) locate things by **role / label / accessible name first** and fall back to
`data-testid` (via `locator.or(...)`). Add the ids below so the specs keep working if visible text changes. Where an element
already has a clear accessible name (button text, label) the id is still wanted, but the spec will not break without it.

Repeating things (rows, cards) carry the id on every instance and must contain the record's number/title text so specs can
`filter({ hasText })`. Action buttons inside a row carry the id on the button itself.

| data-testid | Element | Notes |
|---|---|---|
| `user-menu` | Header account menu trigger | Accessible name today: "Account menu: <name>, <role>" |
| `sign-out` | Sign out item | |
| `tender-create` | "New tender" button/link on /tenders | |
| `tender-no-input` | Tender number field in the tender form | label "Tender number" |
| `tender-title-input` | Title field | |
| `tender-client-select` | Client / organisation select | |
| `tender-value-input` | Estimated value field | rupees, plain number |
| `tender-deadline-input` | Submission deadline field | |
| `tender-save` | Form submit | |
| `tender-row` | One tender in the list (table row or mobile card) | contains tender no + title; the link to detail is inside |
| `go-nogo-request` | "Request GO / NO-GO approval" button on tender detail | |
| `mark-won` | "Mark Won" button on tender detail | opens dialog with a reason box |
| `convert` | "Convert to project" button on tender detail | |
| `dialog-confirm` | Confirm button of any action dialog | |
| `approvals-row` | One pending/decided item in /approvals (row or card) | title must contain the tender number |
| `approve` | Approve button inside an `approvals-row` | **must be absent (or disabled) for the Admin** |
| `reject` | Reject button inside an `approvals-row` | |
| `kpi-active-tenders` | The "Active tenders" KPI tile on /dashboard | tile text must contain the count as a plain integer (first number in the tile) |
| `project-row` | One project in /projects | contains project name, client, value |
| `subcontractor-row` | One subcontractor in /subcontractors | |

## Behaviour the specs assume

- Active tenders = non-deleted tenders whose current stage kind is `OPEN` (same as `getActiveTenders`).
- Requesting GO, Won, conversion: button -> optional dialog (reason textbox + confirm button). A dialog is optional; both work.
- The approval request title contains the tender number, so the inbox row can be found by text.
- A server action that is refused for the Admin must leave the approval request `PENDING` with no recorded decision.
