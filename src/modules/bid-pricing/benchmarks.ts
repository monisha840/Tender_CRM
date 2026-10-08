import "server-only";
import { getPortfolioPnl } from "@/modules/contract-pnl/service";

// "What did similar past projects really cost / earn": rows come straight from Contract P&L (package C).
export interface PnlBenchmarkRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  /** Actual cost to date, rupees. */
  actualCost: string;
  /** Margin to date, rupees (billed - cost). */
  margin: string;
  /** Margin as % of billed, null when nothing is billed yet. */
  marginPct: number | null;
}

/** Billed projects of the same service line and region; completed ones when any exist, otherwise all billed ones. */
export async function loadBenchmarks(q: { serviceLineId: string; regionId: string }): Promise<PnlBenchmarkRow[]> {
  try {
    const { projects } = await getPortfolioPnl();
    const similar = projects.filter((p) => p.serviceLineId === q.serviceLineId && p.regionId === q.regionId && p.billed !== "0.00");
    const done = similar.filter((p) => p.completed);
    return (done.length ? done : similar).map((p) => ({
      projectId: p.projectId,
      projectCode: p.code,
      projectName: p.name,
      actualCost: p.totalCost,
      margin: p.margin,
      marginPct: p.marginPct,
    }));
  } catch (e) {
    console.error("[bid-pricing] benchmark load failed", e);
    return [];
  }
}
