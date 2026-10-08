import type { TenderRow } from "@/lib/data/tenders";
import type { Database } from "@/types";

/** `?status=open` and `?result=won|lost|cancelled|decided` from the dashboard links; null when neither is set/valid. */
export type TenderKindFilter = "OPEN" | "DECIDED" | "WON" | "LOST" | "CANCELLED";

export function parseTenderKind(status: string | null | undefined, result: string | null | undefined): TenderKindFilter | null {
  if (status === "open") return "OPEN";
  switch (result) {
    case "decided":
      return "DECIDED";
    case "won":
      return "WON";
    case "lost":
      return "LOST";
    case "cancelled":
      return "CANCELLED";
    default:
      return null;
  }
}

/**
 * Same definitions as the dashboard: cancelled = a NO_GO stage, or a LOST stage whose result outcome is neutral;
 * lost excludes those, so the chart segment and the list agree.
 */
export function matchesTenderKind(kind: TenderKindFilter, r: TenderRow, db: Database): boolean {
  const isNeutral = r.stage.kind === "LOST" && !!r.tender.resultId && db.tenderResults.some((x) => x.id === r.tender.resultId && x.outcome === "NEUTRAL");
  switch (kind) {
    case "OPEN":
      return r.stage.kind === "OPEN";
    case "DECIDED":
      return r.stage.kind === "WON" || r.stage.kind === "LOST";
    case "WON":
      return r.stage.kind === "WON";
    case "LOST":
      return r.stage.kind === "LOST" && !isNeutral;
    case "CANCELLED":
      return r.stage.kind === "NO_GO" || isNeutral;
  }
}
