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
