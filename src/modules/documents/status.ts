// Pure document-vault logic (no server imports): safe for client components and unit tests.
import { daysBetween } from "@/lib/dates";
import type { IsoDate } from "@/types";

export type DocStatus = "VALID" | "EXPIRING" | "EXPIRED";

export const DEFAULT_EXPIRY_WINDOWS = [60, 30, 7];

/** The "expiring soon" window is the largest configured reminder period (Setting reminders.documentExpiryDays). */
export function soonWindow(windows: unknown): number {
  const nums = Array.isArray(windows) ? windows.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
  return Math.max(...(nums.length ? nums : DEFAULT_EXPIRY_WINDOWS));
}

/** null expiry = does not expire. Expired once the expiry date is before `today`; expiring when within `soonDays`. */
export function documentStatus(expiry: IsoDate | null | undefined, today: IsoDate, soonDays: number = 60): DocStatus {
  if (!expiry) return "VALID";
  if (expiry < today) return "EXPIRED";
  return daysBetween(today, expiry) <= soonDays ? "EXPIRING" : "VALID";
}

/** Days until expiry (negative once expired); null when it never expires. */
export const daysToExpiry = (expiry: IsoDate | null | undefined, today: IsoDate): number | null => (expiry ? daysBetween(today, expiry) : null);

/** True when the document is no longer valid on `date` (expiry strictly before it). */
export const expiredBy = (expiry: IsoDate | null | undefined, date: IsoDate): boolean => !!expiry && expiry < date;

export interface RequiredDoc {
  documentTypeId: string;
  name: string;
}
export interface VaultDocLite {
  documentTypeId: string;
  expiryDate: IsoDate | null;
}
export type DocIssueKind = "MISSING" | "EXPIRED" | "EXPIRES_BEFORE_SUBMISSION";
export interface DocIssue extends RequiredDoc {
  kind: DocIssueKind;
  /** Latest expiry among the vault documents of this type, when any exist. */
  expiryDate: IsoDate | null;
}

/**
 * Mandatory tender documents checked against the vault at the date that matters: the later of the submission
 * date and today. Per document type the best (latest-expiring, or non-expiring) vault document counts.
 *  - MISSING: no vault document of that type (a warning; it does not block submission)
 *  - EXPIRED: every vault document of the type is already expired today (blocks)
 *  - EXPIRES_BEFORE_SUBMISSION: valid today but expires before the submission date (blocks)
 */
export function checkRequiredDocs(required: RequiredDoc[], vault: VaultDocLite[], submissionDate: IsoDate, today: IsoDate): DocIssue[] {
  const checkDate = submissionDate > today ? submissionDate : today;
  const seen = new Set<string>();
  const issues: DocIssue[] = [];
  for (const r of required) {
    if (seen.has(r.documentTypeId)) continue;
    seen.add(r.documentTypeId);
    const docs = vault.filter((v) => v.documentTypeId === r.documentTypeId);
    if (docs.length === 0) {
      issues.push({ ...r, kind: "MISSING", expiryDate: null });
      continue;
    }
    if (docs.some((d) => !d.expiryDate)) continue;
    const latest = docs.map((d) => d.expiryDate as IsoDate).sort().at(-1) as IsoDate;
    if (!expiredBy(latest, checkDate)) continue;
    issues.push({ ...r, kind: latest < today ? "EXPIRED" : "EXPIRES_BEFORE_SUBMISSION", expiryDate: latest });
  }
  return issues;
}

/** The issues that stop a tender being marked Submitted. */
export const blockingIssues = (issues: DocIssue[]): DocIssue[] => issues.filter((i) => i.kind !== "MISSING");

export function issueText(i: DocIssue): string {
  if (i.kind === "MISSING") return `${i.name}: not in the vault`;
  if (i.kind === "EXPIRED") return `${i.name}: expired on ${i.expiryDate}`;
  return `${i.name}: expires ${i.expiryDate}, before the submission date`;
}

// File upload is a placeholder until storage is wired: the file name / location is kept as the first line of `notes`.
const FILE_PREFIX = "File: ";
export function packNotes(fileRef: string | null | undefined, notes: string | null | undefined): string | null {
  const parts = [fileRef ? `${FILE_PREFIX}${fileRef}` : null, notes || null].filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}
export function unpackNotes(raw: string | null | undefined): { fileRef: string | null; notes: string | null } {
  if (!raw) return { fileRef: null, notes: null };
  const [first, ...rest] = raw.split("\n");
  if (first.startsWith(FILE_PREFIX)) return { fileRef: first.slice(FILE_PREFIX.length) || null, notes: rest.join("\n") || null };
  return { fileRef: null, notes: raw };
}

export function submissionBlockMessage(issues: DocIssue[]): string | null {
  const b = blockingIssues(issues);
  if (b.length === 0) return null;
  return `Cannot mark as Submitted: mandatory documents are expired by the submission date. ${b.map(issueText).join("; ")}. Renew them in the Document vault first.`;
}
