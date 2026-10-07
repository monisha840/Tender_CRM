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
