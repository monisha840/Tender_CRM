// Adapter for "what did similar past projects really cost / earn". Package C provides
// `getPnlBenchmarks({serviceLineId, regionId})` in '@/modules/contract-pnl/service'; until that merges this module compiles
// against a local interface with an injectable provider whose default returns nothing.
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

export type PnlBenchmarkProvider = (q: { serviceLineId: string; regionId: string }) => Promise<PnlBenchmarkRow[]>;

let provider: PnlBenchmarkProvider = async () => [];

/** Wire the real provider (done once at merge): `setPnlBenchmarkProvider(getPnlBenchmarks)`. */
export function setPnlBenchmarkProvider(p: PnlBenchmarkProvider): void {
  provider = p;
}

export async function loadBenchmarks(q: { serviceLineId: string; regionId: string }): Promise<PnlBenchmarkRow[]> {
  try {
    return await provider(q);
  } catch (e) {
    console.error("[bid-pricing] benchmark provider failed", e);
    return [];
  }
}
