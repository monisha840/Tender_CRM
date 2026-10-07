# Shared changes requested

Changes needed in shared files (`src/types`, `src/components/ui`, `src/components/layout`, store setup, seed). Module owners do not edit these; each entry says what was worked around.

## Tenders

1. **Project page does not exist yet.** `/projects` is still a placeholder, so "Open project" after converting a tender links to `/projects?focus=<projectId>`. Once the Projects module has a detail route, `entityHref` in `src/lib/data/links.ts` (and the link in `components/tenders/convert-to-project.tsx`) should point at it.
2. **Dynamic routes and `usePathname` in the shell (needs a check).** With `cacheComponents` on, the dev overlay reports "`usePathname()` in a Client Component outside of `<Suspense>`" for `/tenders/[id]`, from `AppShell` / `Sidebar`. `/tenders/[id]` already exports `generateStaticParams` for every seeded tender, which the Next docs say removes the need for Suspense, but the dev overlay still reports it. A production build was not run (it would have overwritten the running dev server's `.next`). Suggested fix if it persists in `next build`: wrap the `usePathname` consumers in `components/layout` (Sidebar, MobileDrawer, BottomNav) in `<Suspense>`.
3. **Audit log on conversion.** The data model asks for an audit entry for every conversion. The store has `auditLogs` but no helper to write one, so converting records a `ProjectConversion` row only. A shared `recordAudit(...)` helper would let every module do this the same way.
4. **Permission for "convert".** There is no `CONVERT` permission action. Tenders uses "APPROVE or EDIT on `tenders`" as a stand-in (Director, Regional Head, Tender Executive, Legal). Add a dedicated action if the client wants it narrower.
5. **`DataTable` switches to cards at `md` (768px), but the sidebar is already open there.** At 768px only about 500px is left for content, so a 9-column table is clipped. Suggest a `breakpoint` prop (`md` | `lg` | `xl`) on `DataTable`. Tenders works around it with its own card list below 1280px and search/filters in the page, and uses `DataTable` only from `xl`.
