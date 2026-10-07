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
// TODO-verify: add expected dashboard figures (pipeline by stage, receivables, ...) once dashboard fields are final.
