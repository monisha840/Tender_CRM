# Shared changes requested

Screens were built without editing shared files. These changes would remove workarounds.

| Area | Requested change | Current workaround |
|---|---|---|
| `src/types/site.ts` | Add `equipment?: { name: string; qty: number }[]` to `DailyWorkReport` | The new-report form collects equipment but it is not stored or shown on the review screen |
| `src/types/site.ts` | Add `photoKeys?: string[]` to `DailyWorkReport` | Only `photoCount` is stored; the review screen shows the count, not thumbnails |
| `src/components/ui` | Add shadcn `Tabs` and `Textarea` | Local `Tabs` and `textareaClass` in `src/components/work/parts.tsx` |
| `src/lib/data/links.ts` | Point `PROJECT`, `SUBCONTRACTOR_BILL` and `SITE` entities at `/projects/[id]`, `/subcontractors/[id]` and `/daily-work/[id]` | Detail routes exist, but notification and approval links still go to `?focus=` on the module root |
| `src/lib/data/projects.ts` | Add a project-wise subcontractor "work pending" selector | Computed in the Subcontractors page from active work orders |
| `src/components/layout/bottom-nav.tsx` | Expose the bottom-nav height as a CSS variable | The sticky submit bar uses `bottom-14` to sit above it |
| Seed (`seed/org.ts` role specs) | Site Engineer and Supervisor have no `dashboard` VIEW permission, so `/dashboard` shows "no access" for them, and their `homePath` is `/daily-work`. | Added a `/home` route (not in the nav, so no permission gate) that renders the same role-aware home. Point site roles' `homePath` or a bottom-nav item at `/home`, or grant `dashboard` VIEW. |
| Seed (`seed/org.ts`) | Accounts `homePath` is `/finance`; the finance home view lives at `/dashboard`. | Reachable from the sidebar Dashboard item (Accounts has `dashboard` VIEW). Change `homePath` to `/dashboard` if the finance home should be the landing page. |
| `lib/nav.ts` / `components/layout` | Bottom nav for site roles has no "My site" (home) item. | None needed for demo; add an item pointing to `/home`. |
| `lib/data/links.ts` | Entity links only carry `?focus=<id>`; list screens would need to read the filter params this work links to (`?status=open`, `?view=deadlines`, `?salary=pending`, `?view=receivables&overdue=1`, `?view=gst`, `?tab=pf`, `?payment=pending`). | Links are emitted anyway; module screens should read these params or ignore them. |
| `components/shared/kpi-tile.tsx` | Sparkline has no axis/tooltip and always uses a fixed 80x24 box. | Used as is. |
