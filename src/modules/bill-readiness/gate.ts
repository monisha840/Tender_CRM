import "server-only";
import { prisma } from "@/lib/server/prisma";
import { getGateReconciliationStatus } from "@/modules/gate-reconciliation/service";

type Db = Pick<typeof prisma, "gateAttendanceUpload" | "gateAttendanceException">;

/** Gate attendance is reconciled when the gate-reconciliation module says so (single rule, owned there). */
export async function isGateReconciled(projectId: string, periodMonth: string, db: Db = prisma): Promise<boolean> {
  return (await getGateReconciliationStatus(projectId, periodMonth, db)).reconciled;
}

/** Same rule for many projects (overview page). */
export async function gateReconciledMap(projectIds: string[], periodMonth: string, db: Db = prisma): Promise<Map<string, boolean>> {
  const flags = await Promise.all(projectIds.map((id) => isGateReconciled(id, periodMonth, db)));
  return new Map(projectIds.map((id, i) => [id, flags[i]]));
}
