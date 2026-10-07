import { PrismaClient } from "@prisma/client";

/** Read-only Prisma helpers for computing expected figures independently of the UI. Never write here. */
let prisma: PrismaClient | undefined;
export const db = () => (prisma ??= new PrismaClient());
export const closeDb = async () => {
  await prisma?.$disconnect();
  prisma = undefined;
};

export async function countTenders(): Promise<number> {
  return db().tender.count({ where: { deletedAt: null } });
}

/**
 * "Active tenders" exactly as getActiveTenders (src/lib/data/dashboard13.ts) defines it: non-deleted tenders whose
 * current stage has kind OPEN (listTenders({ stageKind: "OPEN" }), region filter ALL). WON, LOST, NO_GO and TERMINAL
 * stages are excluded.
 */
export async function countActiveTenders(): Promise<number> {
  return db().tender.count({ where: { deletedAt: null, currentStage: { kind: "OPEN" } } });
}

export const findTender = (tenderNo: string) =>
  db().tender.findFirst({ where: { tenderNo, deletedAt: null }, include: { organisation: true, currentStage: true } });
export const firstTenderId = async () =>
  (await db().tender.findFirst({ where: { deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
export const firstProjectId = async () =>
  (await db().project.findFirst({ where: { deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
export const firstSubcontractorId = async () =>
  (await db().subcontractor.findFirst({ where: { deletedAt: null }, select: { id: true } }))?.id;

/** Latest approval request for an entity (e.g. a tender id), with its steps and recorded actions. */
export const latestApproval = (entityId: string) =>
  db().approvalRequest.findFirst({
    where: { entityId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { steps: { include: { actions: true } } },
  });

export const projectForTender = (tenderId: string) => db().project.findFirst({ where: { tenderId, deletedAt: null } });
