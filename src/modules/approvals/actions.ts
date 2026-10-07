"use server";

import "@/modules/approvals/register-handlers";
import { buildApprovalActions } from "@/modules/approvals/decide-action";
import type { DecideInput } from "@/modules/approvals/service";

const actions = buildApprovalActions();

/**
 * Director decision (approve or reject). The Admin gets FORBIDDEN (approvals:APPROVE / REJECT are Director-only grants)
 * and the requester can never decide their own request (SELF_APPROVAL).
 */
export async function decideApprovalAction(input: DecideInput) {
  return actions.decide(input);
}
