"use server";

import { buildMoneyLockedActions } from "@/modules/money-locked/service";
import type { InstrumentActionInput } from "@/modules/money-locked/schema";

const a = buildMoneyLockedActions();

export async function requestRefundAction(input: InstrumentActionInput) {
  return a.requestRefund(input);
}
export async function markReleasedAction(input: InstrumentActionInput) {
  return a.markReleased(input);
}
