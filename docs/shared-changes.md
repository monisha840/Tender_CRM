# Shared changes requested

Changes needed in shared files (`src/types`, `src/components/ui`, `src/components/layout`, store setup, seed). Module owners do not edit these; each entry says what was worked around.

## Tenders

1. **Project page does not exist yet.** `/projects` is still a placeholder, so "Open project" after converting a tender links to `/projects?focus=<projectId>`. Once the Projects module has a detail route, `entityHref` in `src/lib/data/links.ts` (and the link in `components/tenders/convert-to-project.tsx`) should point at it.
2. **Dynamic routes and `usePathname` in the shell (needs a check).** With `cacheComponents` on, the dev overlay reports "`usePathname()` in a Client Component outside of `<Suspense>`" for `/tenders/[id]`, from `AppShell` / `Sidebar`. `/tenders/[id]` already exports `generateStaticParams` for every seeded tender, which the Next docs say removes the need for Suspense, but the dev overlay still reports it. A production build was not run (it would have overwritten the running dev server's `.next`). Suggested fix if it persists in `next build`: wrap the `usePathname` consumers in `components/layout` (Sidebar, MobileDrawer, BottomNav) in `<Suspense>`.
3. **Audit log on conversion.** The data model asks for an audit entry for every conversion. The store has `auditLogs` but no helper to write one, so converting records a `ProjectConversion` row only. A shared `recordAudit(...)` helper would let every module do this the same way.
4. **Permission for "convert".** There is no `CONVERT` permission action. Tenders uses "APPROVE or EDIT on `tenders`" as a stand-in (Director, Regional Head, Tender Executive, Legal). Add a dedicated action if the client wants it narrower.
5. **`DataTable` switches to cards at `md` (768px), but the sidebar is already open there.** At 768px only about 500px is left for content, so a 9-column table is clipped. Suggest a `breakpoint` prop (`md` | `lg` | `xl`) on `DataTable`. Tenders works around it with its own card list below 1280px and search/filters in the page, and uses `DataTable` only from `xl`.

## Figures agent (A-figures, branch `wave-a/figures`)

Definitions now live in `src/lib/data/definitions.ts`. Changes needed in files I do not own:

1. **`src/components/finance/gst-summary.tsx`** — mount the net-GST position above the table: `<GstNetPosition gstRegistrationId={gstin} />` (import from `./gst-net-position`, a new file I added). `getGstSummary` was unused (B-gap list, "use the unused getGstSummary"). Reason: net GST (output − ITC − TDS) was computed but never shown.
2. **`src/components/finance/helpers.tsx`** — `AGEING_BUCKETS`, `AgeingBucket`, `invoiceAge`, `bucketOf` are now dead (age = days since invoice, the old B9 definition). Delete them, or re-export from `@/lib/data/definitions`. Nothing I own imports them any more.
3. **`src/app/projects/[id]/detail.tsx`** (lines ~120, 206, 98) — "Billed" must be `billing.billed` (taxable, excl. GST) labelled "Billed (excl. GST)"; the chart's `Billed` series (`r.invoice.total`) should use `r.invoice.taxableValue`. `billing.invoicedTotal` stays available for an explicit "Invoiced (incl. GST)" tile. `src/app/projects/page.tsx:171` hint "Billed, not yet received" should read "Invoiced incl. GST, not yet received".
4. **`src/components/dashboard/kpi-grid.tsx`** — item 8 "Employees": label it "Headcount (incl. directors)"; keep "N on payroll (wage above zero)". Item 5 hint "billed" → "billed (excl. GST)".
5. **`src/lib/data/workforce.ts` / `src/app/employees/payroll/page.tsx` (A3)** — payroll "On payroll" is the count of payslips; use `isOnPayroll` from `definitions.ts` and label it "On payroll (wage above zero)" so it equals `dashboard.employees.onPayroll`. Also `getEpfSummary` and `listEmployeePay` should skip soft-deleted rows via `isLive`.
6. **Dashboard drill-down for ageing (B8)** — bucket labels are now `0–30`, `31–60`, `61–90`, `90+` (the old `Not yet due`/`Over 60 days` are gone). `charts.tsx` passes the label through `ageing=`; the Finance receivables tab should read that param against the same labels.
7. **`src/app/subcontractors/page.tsx` and `[id]/detail.tsx`** — "Billed" is gross before GST (non-rejected, non-draft bills); label "Billed (excl. GST)". "Payable"/"Balance" is approved + part-paid bills only.
8. **PF status (dashboard13.ts)** — untouched: A3 owns the PF logic; at merge, take A3's `getPfStatus`/`pfRemittance` over mine.
