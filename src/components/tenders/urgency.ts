import type { TenderRow } from "@/lib/data/tenders";

export type UrgencyTone = "danger" | "warning";

/** Open tenders not yet submitted: overdue or due within 2 days is danger, 3-7 days is a warning. */
export function tenderTone(r: TenderRow): UrgencyTone | undefined {
  if (r.stage.kind !== "OPEN" || r.stage.systemKey === "SUBMITTED") return undefined;
  if (r.daysToDeadline <= 2) return "danger";
  if (r.daysToDeadline <= 7) return "warning";
  return undefined;
}

/** Edge + tint classes for hand-built cards and list rows (same look as DataTable rows). */
export const toneClass = (t?: UrgencyTone) =>
  t === "danger" ? "border-l-4 border-l-status-danger bg-status-danger/5" : t === "warning" ? "border-l-4 border-l-status-warning" : "";
