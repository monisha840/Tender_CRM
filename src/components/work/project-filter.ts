import type { ProjectRow } from "@/lib/data";

/** Project list filter held in `?status=`. GREEN / AMBER / RED are the health drill-downs from the dashboard. */
export type ProjectFilter = "ALL" | "RUNNING" | "COMPLETED" | "RED" | "GREEN" | "AMBER";

const FILTERS: readonly ProjectFilter[] = ["ALL", "RUNNING", "COMPLETED", "RED", "GREEN", "AMBER"];

export function parseProjectFilter(param: string | null | undefined): ProjectFilter {
  return FILTERS.find((f) => f === param) ?? "ALL";
}

const completed = (r: ProjectRow) => r.status.systemKey === "COMPLETED";
const delayed = (r: ProjectRow) => !completed(r) && (r.health === "RED" || r.daysToEnd < 0);

export function matchesProjectFilter(filter: ProjectFilter, r: ProjectRow): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "RED":
      return delayed(r);
    case "COMPLETED":
      return completed(r);
    case "GREEN":
    case "AMBER":
      // Same population as the dashboard health chart: active projects, by health.
      return !completed(r) && r.health === filter;
    default:
      return !completed(r);
  }
}
