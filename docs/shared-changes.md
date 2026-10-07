# Shared changes requested

Changes needed in shared files (`src/types`, `src/components/ui`, `src/components/layout`, store setup, seed). Module owners do not edit these; each entry says what was worked around.

## Tenders

1. **Project page does not exist yet.** `/projects` is still a placeholder, so "Open project" after converting a tender links to `/projects?focus=<projectId>`. Once the Projects module has a detail route, `entityHref` in `src/lib/data/links.ts` (and the link in `components/tenders/convert-to-project.tsx`) should point at it.
2. **Dynamic routes and `usePathname` in the shell (needs a check).** With `cacheComponents` on, the dev overlay reports "`usePathname()` in a Client Component outside of `<Suspense>`" for `/tenders/[id]`, from `AppShell` / `Sidebar`. `/tenders/[id]` already exports `generateStaticParams` for every seeded tender, which the Next docs say removes the need for Suspense, but the dev overlay still reports it. A production build was not run (it would have overwritten the running dev server's `.next`). Suggested fix if it persists in `next build`: wrap the `usePathname` consumers in `components/layout` (Sidebar, MobileDrawer, BottomNav) in `<Suspense>`.
3. **Audit log on conversion.** The data model asks for an audit entry for every conversion. The store has `auditLogs` but no helper to write one, so converting records a `ProjectConversion` row only. A shared `recordAudit(...)` helper would let every module do this the same way.
4. **Permission for "convert".** There is no `CONVERT` permission action. Tenders uses "APPROVE or EDIT on `tenders`" as a stand-in (Director, Regional Head, Tender Executive, Legal). Add a dedicated action if the client wants it narrower.
5. **`DataTable` switches to cards at `md` (768px), but the sidebar is already open there.** At 768px only about 500px is left for content, so a 9-column table is clipped. Suggest a `breakpoint` prop (`md` | `lg` | `xl`) on `DataTable`. Tenders works around it with its own card list below 1280px and search/filters in the page, and uses `DataTable` only from `xl`.

## app-shell (wave-a/app-fixes)

Files I do not own, with the change needed and why. Everything below was worked around inside my own files.

1. `src/store/hooks.ts` `useDb`: apply the as-of date, e.g. `return dbForDate(useDataStore((s) => s.db), useSessionStore((s) => s.asOfDate))` (`dbForDate` is in the new `src/lib/data/as-of.ts`). I added `components/layout/use-as-of-db.ts` (`useAsOfDb`) and use it on dashboards, tenders, projects, daily work, employees, subcontractors and approvals, but `components/finance/**`, `components/notifications/**`, settings and every detail page still use plain `useDb`, so the header date picker does not yet filter them. (Detail pages deliberately stay unfiltered so a deep link to a later record still opens.)
2. `src/lib/data/workforce.ts` `getAttendanceSummary` (B23): replace the `notMarked` / `weekOff` logic with `countAttendanceNotMarked(db, date, region)` from `./sites` (counts employees once, treats HOLIDAY like WEEKOFF). Screens I own already call the new function directly.
3. `src/lib/data/dashboard.ts` `getAttentionItems`: unused now and a third copy of the "needs attention" logic. Delete it. The shared builder is `components/dashboard/attention-data.ts` `getAttention`.
4. `src/components/ui/chart.tsx`: remove `shadow-xl` from `ChartTooltipContent` and import `cn` from `@/lib/utils` (the `cn` package does not merge Tailwind classes). Until then, charts use `components/charts/chart-tooltip.tsx`, which overrides the shadow.
5. Raw `ResponsiveContainer width="100%" height="100%"` still produces the Recharts `width(-1) height(-1)` warning in `components/finance/receivables.tsx` and `components/finance/revenue-chart.tsx`. Use `SizedContainer` from `components/charts/sized-container.tsx`.
6. B26: `new Date().toISOString()` for `createdAt`/`updatedAt` remains in `modules/{approvals,projects,subcontractors,tenders}/entry.ts`, `modules/finance/entry.ts` (default arg) and `components/settings/settings-view.tsx`. Replace with `nowIso()` from `@/lib/dates`.
7. `components/shared/data-table.tsx`: its search box is internal state, so a typed search is lost on navigation. Add an optional controlled `search.value` / `onChange` so pages can keep it in the URL with `useUrlState("q")`. The tender register already keeps its own search in the URL.
8. B9 (finance): the finance Receivables tab buckets by days since invoice (0–30, 31–60, …) while the dashboard buckets by days past due. `?ageing=` from the dashboard is now honoured on the Receivables tab using the dashboard's definition (`DASHBOARD_AGEING` in `lib/data/links.ts`), shown as a removable chip, so the two screens agree on the drill-down. The tab's own bucket cards are unchanged.
9. `tsconfig.json` still excludes `tender-crm` (folder deleted) and `.gitignore` still lists `/tender-crm/`; both can go.
