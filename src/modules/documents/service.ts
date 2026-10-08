import "server-only";
// Server-only: never import from client components.
import type { Tx } from "@/lib/server/audit";
import { runAction, ServiceError, updateWithVersion, type UserResolver } from "@/lib/server/service";
import { createDocumentSchema, deleteDocumentSchema, replaceDocumentSchema, tenderIdSchema, updateDocumentSchema } from "./schema";
import { loadTenderDocIssues } from "./guard";
import { packNotes, unpackNotes } from "./status";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);

type Row = { documentTypeId: string; title: string; referenceNo: string | null; issueDate: Date | null; expiryDate: Date | null; notes: string | null };
const snapshot = (r: Row) => ({
  documentTypeId: r.documentTypeId, title: r.title, referenceNo: r.referenceNo, issueDate: day(r.issueDate), expiryDate: day(r.expiryDate), ...unpackNotes(r.notes),
});

async function loadDoc(tx: Tx, id: string) {
  const d = await tx.companyDocument.findFirst({ where: { id, deletedAt: null } });
  if (!d) throw new ServiceError("NOT_FOUND", "Document not found. It may have been removed.");
  return d;
}
async function assertType(tx: Tx, documentTypeId: string) {
  if (!(await tx.documentType.findFirst({ where: { id: documentTypeId, isActive: true, deletedAt: null }, select: { id: true } }))) {
    throw new ServiceError("VALIDATION", "Document type not found");
  }
}

/** Server actions for the vault. `getUser` lets tests inject a user. */
export function buildDocumentActions(getUser?: UserResolver) {
  const create = runAction({ schema: createDocumentSchema, module: "documents", action: "CREATE", getUser }, async ({ tx, user, input, audit }) => {
    await assertType(tx, input.documentTypeId);
    const row = await tx.companyDocument.create({
      data: {
        documentTypeId: input.documentTypeId, title: input.title, referenceNo: input.referenceNo,
        issueDate: toDate(input.issueDate), expiryDate: toDate(input.expiryDate), notes: packNotes(input.fileRef, input.notes), createdById: user.id,
      },
    });
    await audit({ action: "document.create", entityType: "CompanyDocument", entityId: row.id, after: snapshot(row), summary: `Added vault document ${row.title}` });
    return { id: row.id };
  });

  const update = runAction({ schema: updateDocumentSchema, module: "documents", action: "EDIT", getUser }, async ({ tx, user, input, audit }) => {
    const before = await loadDoc(tx, input.id);
    await assertType(tx, input.documentTypeId);
    const data = {
      documentTypeId: input.documentTypeId, title: input.title, referenceNo: input.referenceNo,
      issueDate: toDate(input.issueDate), expiryDate: toDate(input.expiryDate), notes: packNotes(input.fileRef, input.notes), updatedById: user.id,
    };
    await updateWithVersion(tx.companyDocument, before.id, input.version, data);
    await audit({
      action: "document.update", entityType: "CompanyDocument", entityId: before.id,
      before: snapshot(before), after: snapshot({ ...before, ...data }), summary: `Updated vault document ${input.title}`,
    });
    return { id: before.id };
  });

  const replace = runAction({ schema: replaceDocumentSchema, module: "documents", action: "EDIT", reasonRequired: true, getUser }, async ({ tx, user, input, audit }) => {
    const before = await loadDoc(tx, input.id);
    const prev = unpackNotes(before.notes);
    const data = {
      referenceNo: input.referenceNo ?? before.referenceNo, issueDate: toDate(input.issueDate), expiryDate: toDate(input.expiryDate),
      notes: packNotes(input.fileRef ?? prev.fileRef, prev.notes), updatedById: user.id,
    };
    await updateWithVersion(tx.companyDocument, before.id, input.version, data);
    await audit({
      action: "document.replace", entityType: "CompanyDocument", entityId: before.id,
      before: snapshot(before), after: snapshot({ ...before, ...data }), reason: input.reason, summary: `Replaced (renewed) vault document ${before.title}`,
    });
    return { id: before.id };
  });

  const remove = runAction({ schema: deleteDocumentSchema, module: "documents", action: "EDIT", reasonRequired: true, getUser }, async ({ tx, user, input, audit }) => {
    const before = await loadDoc(tx, input.id);
    await updateWithVersion(tx.companyDocument, before.id, input.version, { deletedAt: new Date(), isActive: false, updatedById: user.id });
    await audit({
      action: "document.delete", entityType: "CompanyDocument", entityId: before.id, before: snapshot(before), reason: input.reason, summary: `Removed vault document ${before.title}`,
    });
    return { id: before.id };
  });

  /** Read-only: mandatory documents of a tender that are missing or expire before its submission date. */
  const tenderIssues = runAction({ schema: tenderIdSchema, module: "documents", action: "VIEW", getUser }, async ({ tx, input }) => {
    const res = await loadTenderDocIssues(tx, input.tenderId);
    if (!res) throw new ServiceError("NOT_FOUND", "Tender not found");
    return res;
  });

  return { create, update, replace, remove, tenderIssues };
}
