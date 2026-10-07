import { istToUtc, nowIso, toIstDate } from "@/lib/dates";
import type { Database, Id, Tender, TenderStageHistory } from "@/types";

/** Raw form / CSV values. Lookup fields accept an id, a name or (organisations) a short name. */
export interface TenderEntryValues {
  tenderNo: string;
  title: string;
  organisation: string;
  serviceLine: string;
  region: string;
  location?: string;
  estimatedValue?: string;
  emdAmount?: string;
  tenderFee?: string;
  /** "YYYY-MM-DDTHH:mm", "YYYY-MM-DD", or DD-MM-YYYY [HH:mm] (IST). */
  submissionDeadline: string;
  openingDate?: string;
  workDescription?: string;
  tenderType?: string;
  owner?: string;
}

export type BuildTenderResult = { rows: { tenders: Tender[]; tenderStageHistory: TenderStageHistory[] } } | { error: string };

/** CSV column -> value key. Export uses the same headers (plus Stage, which import ignores). */
export const TENDER_CSV_COLUMNS: [header: string, key: keyof TenderEntryValues][] = [
  ["Tender No", "tenderNo"],
  ["Title", "title"],
  ["Organisation", "organisation"],
  ["Service Line", "serviceLine"],
  ["Region", "region"],
  ["Location", "location"],
  ["Estimated Value", "estimatedValue"],
  ["EMD", "emdAmount"],
  ["Tender Fee", "tenderFee"],
  ["Submission Deadline", "submissionDeadline"],
  ["Opening Date", "openingDate"],
  ["Tender Type", "tenderType"],
  ["Work Description", "workDescription"],
];

const norm = (s: string | undefined | null) => (s ?? "").trim().toLowerCase();

function find<T extends { id: Id; name: string; shortName?: string }>(list: T[], input: string | undefined): T | undefined {
  const q = norm(input);
  if (!q) return undefined;
  return list.find((x) => x.id === input?.trim() || norm(x.name) === q || (x.shortName && norm(x.shortName) === q));
}

export function parseMoney(raw: string | undefined, label: string): string | { error: string } {
  const s = (raw ?? "").replace(/[₹,\s]/g, "");
  if (!s) return "0.00";
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: `${label} must be a positive amount (up to 2 decimals)` };
  const [i, f = ""] = s.split(".");
  return `${i.replace(/^0+(?=\d)/, "")}.${f.padEnd(2, "0")}`;
}

/** Returns IST date + time, or null when unparseable. */
export function parseDateTime(raw: string | undefined): { date: string; time: string } | null {
  const s = (raw ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ,]+\s*(\d{1,2}):(\d{2}))?$/.exec(s);
  let y: string, mo: string, d: string, h: string | undefined, mi: string | undefined;
  if (m) [, y, mo, d, h, mi] = m;
  else if ((m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T ,]+\s*(\d{1,2}):(\d{2}))?$/.exec(s))) [, d, mo, y, h, mi] = m;
  else return null;
  const date = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const t = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== date) return null;
  const hh = Number(h ?? 17);
  const mm = Number(mi ?? 0);
  if (hh > 23 || mm > 59) return null;
  return { date, time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` };
}

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Pure: validates, resolves lookups and returns the rows to upsert. Shared by the form and CSV import. */
export function buildTender(db: Database, v: TenderEntryValues, userId: Id): BuildTenderResult {
  const tenderNo = v.tenderNo?.trim();
  const title = v.title?.trim();
  if (!tenderNo) return { error: "Tender no is required" };
  if (!title) return { error: "Title is required" };
  if (db.tenders.some((t) => !t.deletedAt && norm(t.tenderNo) === norm(tenderNo))) return { error: `Tender no '${tenderNo}' already exists` };

  const org = find(db.organisations, v.organisation);
  if (!org) return { error: `Organisation '${v.organisation ?? ""}' not found` };
  const line = find(db.serviceLines.filter((l) => l.isActive), v.serviceLine);
  if (!line) return { error: `Service line '${v.serviceLine ?? ""}' not found` };
  const region = find(db.regions.filter((r) => r.isActive), v.region);
  if (!region) return { error: `Region '${v.region ?? ""}' not found` };
  let type = find(db.tenderTypes.filter((t) => t.isActive), v.tenderType);
  if (norm(v.tenderType) && !type) return { error: `Tender type '${v.tenderType}' not found` };
  type ??= db.tenderTypes.find((t) => t.isActive);
  if (!type) return { error: "No tender type is configured" };
  const owner = norm(v.owner) ? db.users.find((u) => u.id === v.owner?.trim() || norm(u.name) === norm(v.owner)) : db.users.find((u) => u.id === userId);
  if (!owner) return { error: `Owner '${v.owner ?? ""}' not found` };

  const est = parseMoney(v.estimatedValue, "Estimated value");
  const emd = parseMoney(v.emdAmount, "EMD");
  const fee = parseMoney(v.tenderFee, "Tender fee");
  for (const m of [est, emd, fee]) if (typeof m !== "string") return m;

  const dl = parseDateTime(v.submissionDeadline);
  if (!dl) return { error: "Submission deadline is not a valid date (use DD-MM-YYYY or DD-MM-YYYY HH:mm)" };
  let openingDate = dl.date;
  if (norm(v.openingDate)) {
    const o = parseDateTime(v.openingDate);
    if (!o) return { error: "Opening date is not a valid date" };
    openingDate = o.date;
  }

  const stage = db.tenderStages.filter((s) => s.kind === "OPEN" && s.isActive).sort((a, b) => a.sequence - b.sequence)[0];
  if (!stage) return { error: "No open tender stage is configured" };

  const now = nowIso();
  const id = newId("tnd");
  const submissionDeadlineAt = istToUtc(dl.date, dl.time);
  const tender: Tender = {
    id,
    createdAt: now,
    updatedAt: now,
    tenderNo,
    title,
    workDescription: v.workDescription?.trim() ?? "",
    eligibility: "",
    serviceLineId: line.id,
    siteId: null,
    organisationId: org.id,
    regionId: region.id,
    location: v.location?.trim() ?? "",
    tenderTypeId: type.id,
    portalId: null,
    sourceUrl: null,
    estimatedValue: est as string,
    emdAmount: emd as string,
    tenderFee: fee as string,
    publishedOn: toIstDate(now),
    preBidAt: null,
    submissionDeadlineAt,
    openingDate,
    technicalOpeningAt: null,
    financialOpeningAt: null,
    currentStageId: stage.id,
    resultId: null,
    ownerId: owner.id,
    gstRegistrationId: null,
  };
  const history: TenderStageHistory = {
    id: newId("tsh"),
    createdAt: now,
    updatedAt: now,
    tenderId: id,
    fromStageId: null,
    toStageId: stage.id,
    changedById: userId,
    changedAt: now,
    reason: null,
  };
  return { rows: { tenders: [tender], tenderStageHistory: [history] } };
}

/** Maps a CSV record (keyed by header, case-insensitive) to entry values. */
export function csvRecordToValues(record: Record<string, string>): TenderEntryValues {
  const lower = Object.fromEntries(Object.entries(record).map(([k, val]) => [norm(k), val]));
  const out: Record<string, string> = {};
  TENDER_CSV_COLUMNS.forEach(([header, key]) => (out[key] = lower[norm(header)] ?? ""));
  return out as unknown as TenderEntryValues;
}
