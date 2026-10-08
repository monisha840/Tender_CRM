import "server-only";
import { prisma } from "@/lib/server/prisma";

type Db = Pick<typeof prisma, "gateAttendanceUpload" | "gateAttendanceException">;

/**
 * Gate attendance is reconciled for a project and month when an upload exists for it and no OPEN exception remains.
 * (The gate-reconciliation package owns the data; this only reads it.)
 */
export async function isGateReconciled(projectId: string, periodMonth: string, db: Db = prisma): Promise<boolean> {
  const map = await gateReconciledMap([projectId], periodMonth, db);
  return map.get(projectId) ?? false;
}

/** Same rule for many projects in two queries (overview page). */
export async function gateReconciledMap(projectIds: string[], periodMonth: string, db: Db = prisma): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>(projectIds.map((id) => [id, false]));
  if (projectIds.length === 0) return out;
  const [uploads, open] = await Promise.all([
    db.gateAttendanceUpload.findMany({ where: { projectId: { in: projectIds }, periodMonth, deletedAt: null }, select: { projectId: true } }),
    db.gateAttendanceException.findMany({
      where: { projectId: { in: projectIds }, status: "OPEN", deletedAt: null, upload: { periodMonth, deletedAt: null } },
      select: { projectId: true },
    }),
  ]);
  const openSet = new Set(open.map((e) => e.projectId));
  for (const u of uploads) out.set(u.projectId, !openSet.has(u.projectId));
  return out;
}
