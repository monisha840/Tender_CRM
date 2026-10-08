"use server";

import { buildBillReadinessActions } from "@/modules/bill-readiness/service";
import type { SetCheckRaw, TemplateItemRaw } from "@/modules/bill-readiness/schema";

const a = buildBillReadinessActions();

export async function setBillReadinessCheckAction(input: SetCheckRaw) {
  return a.setCheck(input);
}
export async function saveBillReadinessTemplateItemAction(input: TemplateItemRaw) {
  return a.saveTemplateItem(input);
}
export async function seedBillReadinessTemplateAction() {
  return a.seedTemplate({});
}
