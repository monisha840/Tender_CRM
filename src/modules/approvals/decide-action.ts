// Server-only. Kept out of the 'use server' file so tests can inject a user resolver.
import "@/modules/approvals/register-handlers";
import { runAction, type UserResolver } from "@/lib/server/service";
import { decideInTx, decideSchema } from "@/modules/approvals/service";

export function buildApprovalActions(getUser?: UserResolver) {
  const decide = runAction(
    { schema: decideSchema, module: "approvals", action: (i) => i.decision, getUser },
    async ({ tx, user, input, audit }) => decideInTx(tx, user, input, audit),
  );
  return { decide };
}
