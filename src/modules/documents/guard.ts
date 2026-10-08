import "server-only";
// Server-only: tender-vs-vault checks, usable inside any transaction.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { ServiceError } from "@/lib/server/service";
import { toIstDate } from "@/lib/dates";
import { checkRequiredDocs, submissionBlockMessage, type DocIssue } from "./status";

type Db = Pick<typeof prisma, "tender" | "tenderDocumentItem" | "companyDocument"> | Prisma.TransactionClient;

export const todayIstDate = () => toIstDate(new Date().toISOString());
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Mandatory documents of a tender that are missing from the vault, or expired / expiring before the submission date. */
export async function loadTenderDocIssues(db: Db, tenderId: string): Promise<{ issues: DocIssue[]; submissionDate: string } | null> {
  const tender = await db.tender.findFirst({ where: { id: tenderId, deletedAt: null }, select: { submissionDeadlineAt: true } });
  if (!tender) return null;
  const items = await db.tenderDocumentItem.findMany({
    where: { tenderId, isMandatory: true, deletedAt: null },
    select: { documentTypeId: true, name: true, documentType: { select: { name: true } } },
  });
  const typeIds = [...new Set(items.map((i) => i.documentTypeId))];
  const vault = typeIds.length
    ? await db.companyDocument.findMany({
        where: { documentTypeId: { in: typeIds }, isActive: true, deletedAt: null },
        select: { documentTypeId: true, expiryDate: true },
      })
    : [];
  const submissionDate = toIstDate(tender.submissionDeadlineAt.toISOString());
  const issues = checkRequiredDocs(
    items.map((i) => ({ documentTypeId: i.documentTypeId, name: i.documentType.name || i.name })),
    vault.map((v) => ({ documentTypeId: v.documentTypeId, expiryDate: day(v.expiryDate) })),
    submissionDate,
    todayIstDate(),
  );
  return { issues, submissionDate };
}

/** Throws a ServiceError listing the documents when a mandatory vault document is expired by the submission date. */
export async function assertDocsReadyForSubmission(db: Db, tenderId: string): Promise<void> {
  const res = await loadTenderDocIssues(db, tenderId);
  const message = res ? submissionBlockMessage(res.issues) : null;
  if (message) throw new ServiceError("CONFLICT", message);
}
