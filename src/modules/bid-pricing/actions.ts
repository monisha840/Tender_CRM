"use server";

import { buildPricingActions } from "@/modules/bid-pricing/service";
import type { PricingContextInput, SavePricingInput } from "@/modules/bid-pricing/schema";

const a = buildPricingActions();

export async function getPricingContextAction(input: PricingContextInput) {
  return a.context(input);
}
export async function savePricingAction(input: SavePricingInput) {
  return a.save(input);
}
