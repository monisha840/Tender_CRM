import { byId } from "@/lib/data/shared";
import { getToday } from "@/lib/dates";
import { gstinError, gstinPan, gstinStateCode, isValidPan } from "@/lib/gst-validation";
import type { Database, Party, Subcontractor, SubcontractorStatus, SubcontractorWorkOrder } from "@/types";
import { canonicalise, findRow, newId, parseDate, parseMoney, parsePercent, parseYesNo } from "../work-entry-utils";

export const SUBCONTRACTOR_KEYS = [
  "name", "contactName", "phone", "email", "gstin", "pan", "address", "state", "tradeCategory", "isLabourSupplier", "status",
] as const;

/**
 * Headers for both the CSV export and the import template. Import ignores the read-only columns
 * (Projects, Contract value, Billed, Payable), so an exported file can be edited and imported back.
 */
export const SUBCONTRACTOR_CSV_HEADERS = [
  "Name", "Trade category", "Contact name", "Phone", "Email", "GSTIN", "PAN", "Address", "State", "Labour supplier", "Status",
  "Projects", "Contract value", "Billed", "Payable",
];

export const SUBCONTRACTOR_STATUSES: { value: SubcontractorStatus; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "BLACKLISTED", label: "Blacklisted" },
];

/**
 * Looks for an existing subcontractor with the same GSTIN, or the same PAN (a PAN may repeat only when both records carry GSTINs of different states).
 * `taken` holds keys added earlier in the same import: lower-case names, "gstin:<GSTIN>" and "pan:<PAN>|<state code or empty>".
 */
function duplicateRegistration(db: Database, taken: ReadonlySet<string>, pan: string, gstin: string): string | null {
  const state = gstin ? gstinStateCode(gstin) : "";
  const existing = db.subcontractors
    .filter((s) => !s.deletedAt)
    .map((s) => byId(db.parties, s.partyId))
    .filter((p): p is Party => !!p && !p.deletedAt);
  if (gstin) {
    const hit = existing.find((p) => p.gstin?.toUpperCase() === gstin);
    if (hit) return `GSTIN ${gstin} already belongs to '${hit.name}'`;
    if (taken.has(`gstin:${gstin}`)) return `GSTIN ${gstin} appears twice in this file`;
  }
  const samePan = (otherPan: string, otherState: string) => otherPan === pan && (!state || !otherState || state === otherState);
  const hit = existing.find((p) => samePan((p.pan ?? "").toUpperCase(), p.gstin ? gstinStateCode(p.gstin) : ""));
  if (hit) return `PAN ${pan} already belongs to '${hit.name}'`;
  for (const k of taken) {
    const m = /^pan:([^|]+)\|(.*)$/.exec(k);
    if (m && samePan(m[1], m[2])) return `PAN ${pan} appears twice in this file`;
  }
  return null;
}

export type SubcontractorResult = { party: Party; subcontractor: Subcontractor; error: null } | { party?: undefined; subcontractor?: undefined; error: string };

/** Builds a Party + Subcontractor pair from form values or one CSV record. `taken` holds names added earlier in the same import. */
export function buildSubcontractor(db: Database, input: Record<string, string>, taken: ReadonlySet<string> = new Set()): SubcontractorResult {
  const v = canonicalise(input, SUBCONTRACTOR_KEYS);
  if (!v.name) return { error: "Name is required" };
  const dupe = db.parties.some((p) => !p.deletedAt && p.name.trim().toLowerCase() === v.name.toLowerCase()) || taken.has(v.name.toLowerCase());
  if (dupe) return { error: `'${v.name}' already exists` };
  if (!v.contactName) return { error: "Contact person is required" };
  if (!v.phone) return { error: "Phone is required" };
  if (!/^[+\d][\d\s-]{6,}$/.test(v.phone)) return { error: `Phone '${v.phone}' is not valid` };
  if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) return { error: `Email '${v.email}' is not valid` };
  const pan = (v.pan ?? "").toUpperCase();
  if (!isValidPan(pan)) return { error: "PAN must look like ABCDE1234F (4th letter is the holder type, e.g. C company, F firm, P person)" };
  const gstin = (v.gstin ?? "").toUpperCase();
  if (gstin) {
    const err = gstinError(gstin);
    if (err) return { error: `GSTIN '${v.gstin}': ${err}` };
    if (gstinPan(gstin) !== pan) return { error: `GSTIN '${gstin}' contains PAN ${gstinPan(gstin)}, which differs from the PAN ${pan}` };
  }
  const state = findRow(db.states, v.state ?? "", (s) => s.name) ?? findRow(db.states, v.state ?? "", (s) => s.code);
  if (!state) return { error: v.state ? `State '${v.state}' not found` : "State is required" };
  if (gstin && gstinStateCode(gstin) !== state.gstStateCode) return { error: `GSTIN state code ${gstinStateCode(gstin)} does not match the state '${state.name}' (${state.gstStateCode})` };
  const dup = duplicateRegistration(db, taken, pan, gstin);
  if (dup) return { error: dup };
  if (!v.tradeCategory) return { error: "Trade category is required" };
  const labour = parseYesNo(v.isLabourSupplier ?? "");
  if (labour === undefined) return { error: `Labour supplier '${v.isLabourSupplier}' must be Yes or No` };
  const status = (v.status || "ACTIVE").toUpperCase() as SubcontractorStatus;
  if (!SUBCONTRACTOR_STATUSES.some((s) => s.value === status)) return { error: `Status '${v.status}' must be ACTIVE, INACTIVE or BLACKLISTED` };

  const now = new Date().toISOString();
  const meta = { createdAt: now, updatedAt: now, deletedAt: null };
  const party: Party = {
    ...meta, id: newId("party_sub"), name: v.name, gstin: gstin || null, pan, address: v.address ?? "", stateId: state.id,
    contactName: v.contactName, phone: v.phone, email: v.email || null, isActive: status === "ACTIVE",
  };
  return { error: null, party, subcontractor: { ...meta, id: newId("sub"), partyId: party.id, tradeCategory: v.tradeCategory, isLabourSupplier: labour, status } };
}

export function buildSubcontractors(db: Database, records: Record<string, string>[]): { parties: Party[]; subcontractors: Subcontractor[]; errors: string[] } {
  const parties: Party[] = [];
  const subcontractors: Subcontractor[] = [];
  const errors: string[] = [];
  const taken = new Set<string>();
  records.forEach((rec, i) => {
    const r = buildSubcontractor(db, rec, taken);
    if (r.error !== null) errors.push(`Row ${i + 2}: ${r.error}`);
    else {
      taken.add(r.party.name.toLowerCase());
      if (r.party.gstin) taken.add(`gstin:${r.party.gstin}`);
      taken.add(`pan:${r.party.pan}|${r.party.gstin ? gstinStateCode(r.party.gstin) : ""}`);
      parties.push(r.party);
      subcontractors.push(r.subcontractor);
    }
  });
  return { parties, subcontractors, errors };
}

export const ASSIGNMENT_KEYS = ["subcontractor", "project", "trade", "scope", "contractValue", "startDate", "endDate", "retentionPercent"] as const;

/** Creates a work order (the subcontractor <-> project assignment). Subcontractor and project are matched by id, name or project code. */
export function buildAssignment(db: Database, input: Record<string, string>): { workOrder: SubcontractorWorkOrder; error: null } | { workOrder?: undefined; error: string } {
  const v = canonicalise(input, ASSIGNMENT_KEYS);
  const sub = db.subcontractors.find((s) => !s.deletedAt && (s.id === v.subcontractor || byId(db.parties, s.partyId)?.name.toLowerCase() === (v.subcontractor ?? "").toLowerCase()));
  if (!sub) return { error: v.subcontractor ? `Subcontractor '${v.subcontractor}' not found` : "Subcontractor is required" };
  if (sub.status === "BLACKLISTED") return { error: "This subcontractor is blacklisted and cannot be assigned work" };
  const projects = db.projects.filter((p) => !p.deletedAt);
  const project = findRow(projects, v.project ?? "", (p) => p.name) ?? findRow(projects, v.project ?? "", (p) => p.code);
  if (!project) return { error: v.project ? `Project '${v.project}' not found` : "Project is required" };
  if (!v.trade) return { error: "Trade is required" };
  const value = parseMoney(v.contractValue ?? "");
  if (value === undefined || Number(value) <= 0) return { error: "Contract value must be a number greater than 0" };
  const start = parseDate(v.startDate ?? "") ?? getToday();
  const end = parseDate(v.endDate ?? "");
  if (parseDate(v.startDate ?? "") === undefined) return { error: "Start date is not a valid date (use DD-MM-YYYY)" };
  if (end === undefined) return { error: "End date is not a valid date (use DD-MM-YYYY)" };
  if (end && end < start) return { error: "End date is before the start date" };
  const retention = parsePercent(v.retentionPercent || "0");
  if (retention === undefined) return { error: "Retention must be a percentage between 0 and 100" };

  const now = new Date().toISOString();
  const region = byId(db.regions, project.regionId);
  const seq = db.workOrders.filter((w) => w.projectId === project.id).length + 1;
  return {
    error: null,
    workOrder: {
      id: newId("wo"), createdAt: now, updatedAt: now, deletedAt: null,
      subcontractorId: sub.id, projectId: project.id, siteId: project.siteId, regionId: project.regionId,
      workOrderNo: `SPH/${region?.code ?? "GEN"}/WO/${start.slice(0, 4)}/${project.code.split("-").pop()}-${String(seq).padStart(2, "0")}`,
      trade: v.trade, scope: v.scope ?? "", progressPercent: "0.0000", contractValue: value, startDate: start, endDate: end,
      retentionPercent: retention, status: "ACTIVE",
    },
  };
}
