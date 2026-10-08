import "server-only";
import { prisma } from "@/lib/server/prisma";
import { getSettingValue } from "@/lib/server/settings-read";
import { documentStatus, soonWindow, unpackNotes, DEFAULT_EXPIRY_WINDOWS, type DocStatus } from "./status";
import { todayIstDate } from "./guard";

export interface VaultRow {
  id: string;
  documentTypeId: string;
  documentTypeName: string;
  title: string;
  referenceNo: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  fileRef: string | null;
  notes: string | null;
  version: number;
  status: DocStatus;
  /** Days to expiry (negative once expired); null = no expiry. */
  daysLeft: number | null;
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function loadVault() {
  const today = todayIstDate();
  const [rows, types, windows] = await Promise.all([
    prisma.companyDocument.findMany({ where: { deletedAt: null, isActive: true }, orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { title: "asc" }] }),
    prisma.documentType.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSettingValue<number[]>("reminders.documentExpiryDays", DEFAULT_EXPIRY_WINDOWS),
  ]);
  const soon = soonWindow(windows);
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const list: VaultRow[] = rows.map((r) => {
    const expiry = day(r.expiryDate);
    const { fileRef, notes } = unpackNotes(r.notes);
    return {
      id: r.id, documentTypeId: r.documentTypeId, documentTypeName: typeName.get(r.documentTypeId) ?? "Document", title: r.title, referenceNo: r.referenceNo,
      issueDate: day(r.issueDate), expiryDate: expiry, fileRef, notes, version: r.version,
      status: documentStatus(expiry, today, soon),
      daysLeft: expiry ? Math.round((Date.parse(expiry) - Date.parse(today)) / 86_400_000) : null,
    };
  });
  return { rows: list, types, soonDays: soon, today };
}
