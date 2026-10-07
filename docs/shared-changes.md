# Shared changes requested

Changes needed in shared files (`src/types`, `src/components/ui`, `src/components/layout`, store setup, seed). Module owners do not edit these; each entry says what was worked around.

## Tenders

1. **Project page does not exist yet.** `/projects` is still a placeholder, so "Open project" after converting a tender links to `/projects?focus=<projectId>`. Once the Projects module has a detail route, `entityHref` in `src/lib/data/links.ts` (and the link in `components/tenders/convert-to-project.tsx`) should point at it.
2. **Dynamic routes and `usePathname` in the shell (needs a check).** With `cacheComponents` on, the dev overlay reports "`usePathname()` in a Client Component outside of `<Suspense>`" for `/tenders/[id]`, from `AppShell` / `Sidebar`. `/tenders/[id]` already exports `generateStaticParams` for every seeded tender, which the Next docs say removes the need for Suspense, but the dev overlay still reports it. A production build was not run (it would have overwritten the running dev server's `.next`). Suggested fix if it persists in `next build`: wrap the `usePathname` consumers in `components/layout` (Sidebar, MobileDrawer, BottomNav) in `<Suspense>`.
3. **Audit log on conversion.** The data model asks for an audit entry for every conversion. The store has `auditLogs` but no helper to write one, so converting records a `ProjectConversion` row only. A shared `recordAudit(...)` helper would let every module do this the same way.
4. **Permission for "convert".** There is no `CONVERT` permission action. Tenders uses "APPROVE or EDIT on `tenders`" as a stand-in (Director, Regional Head, Tender Executive, Legal). Add a dedicated action if the client wants it narrower.
5. **`DataTable` switches to cards at `md` (768px), but the sidebar is already open there.** At 768px only about 500px is left for content, so a 9-column table is clipped. Suggest a `breakpoint` prop (`md` | `lg` | `xl`) on `DataTable`. Tenders works around it with its own card list below 1280px and search/filters in the page, and uses `DataTable` only from `xl`.

## Tooling and tests (Wave A)

1. **`src/components/ui/*.tsx` still import `cn` from the npm package `cn`, not `@/lib/utils`.** Files: `badge`, `button`, `card`, `chart`, `dropdown-menu`, `input`, `select`, `separator`, `sheet`, `skeleton` (and any others importing `from "cn"`). `src/lib/utils.ts` now exports `cn` = `clsx` + `tailwind-merge`, so feature code that imports `@/lib/utils` already merges conflicting Tailwind classes; the shadcn primitives do not yet. Change: replace `import { cn } from "cn"` with `import { cn } from "@/lib/utils"` in those files. Once nothing imports `"cn"`, remove the `cn` dependency from `package.json` (tooling owner). Reason: one `cn` everywhere, so a `className` passed to a primitive reliably overrides its defaults.
2. **`@types/node` moved from `^20` to `^22`** (dev). Vitest 5 requires `^22 || >=24` as a peer and the install otherwise fails with ERESOLVE. The machine runs Node 24.

## Finance agent (Wave A)

1. **`src/lib/data/accounts.ts` (B20):** use `outstandingMoney(net, received)` and `hasOutstanding(net, received)` from `lib/money` instead of `subMoney` + `Number(x) > 0` in `listInvoices`, `listReceivables` and the summaries. Reason: over-receipt currently shows a negative balance and hides the invoice.
2. **`src/lib/data/seed/workorders.ts` (B17):** the `SUBS` GSTIN literals have invalid check characters. `seed/parties.ts` repairs them at seed time. Please fix the literals at source.
3. **`src/lib/__tests__/baseline.test.ts` (A0 file):** I changed it because the B6 rule (GSTIN must fit the project) breaks the tests that used an arbitrary other-state GSTIN. Edits: `interProject` and `intraProject` helpers; the "starts an FY series" expectation now uses the new format `SPH/MH/2627/0001`; the todos and the "current behaviour" test for B1, B4, B5, B6, B7, B18 and B19 were removed, because `finance-money.test.ts` and `finance-invoices.test.ts` now cover them. The B20 todo is kept (it needs item 1).
4. **`useDataStore.upsert("retentionEntries", …)`** is now called by `invoice-form.tsx` for B7. No store change is needed.
5. **Customer GSTIN per plant state:** `Organisation` has only one `gstin`. For a plant in another state, `customerGstinFor` derives the plant-state GSTIN from the same PAN. This is a demo assumption. Wave B needs a per-state customer GSTIN table.
