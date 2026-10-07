import { addDays, getToday } from "@/lib/dates";
import { byId } from "@/lib/data/shared";
import type { BillingCycle, ContractType, Database, Project } from "@/types";
import { canonicalise, findRow, newId, parseDate, parseMoney } from "../work-entry-utils";

/** Canonical keys. The form uses these as field names; CSV headers are matched to them ignoring case and punctuation. */
export const PROJECT_KEYS = [
  "name", "code", "customer", "site", "serviceLine", "contractType", "billingCycle", "workOrderNo", "workOrderDate",
  "paymentTermsDays", "contractValue", "startDate", "plannedEndDate", "gstin", "status", "projectManager",
] as const;

/**
 * Headers for both the CSV export and the import template. Import ignores the read-only columns
 * (Progress %, Health), so an exported file can be edited and imported back.
 */
export const PROJECT_CSV_HEADERS = [
  "Code", "Name", "Customer", "Site", "Service line", "Contract type", "Billing cycle", "Work order no", "Work order date",
  "Payment terms days", "Contract value", "Start date", "Planned end date", "GSTIN", "Status", "Project manager", "Progress %", "Health",
];

export const CONTRACT_TYPES: { value: ContractType; label: string }[] = [
  { value: "SERVICE", label: "Service contract (monthly)" },
  { value: "FIXED_SCOPE", label: "Fixed scope (milestones)" },
];
export const BILLING_CYCLES: { value: BillingCycle; label: string }[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "MILESTONE", label: "Milestone" },
  { value: "ON_COMPLETION", label: "On completion" },
];

/** Next free code like "SPH-CHH-07" for a region (or a generic one when the region is not known). */
export function nextProjectCode(db: Database, regionId?: string, taken: ReadonlySet<string> = new Set()): string {
  const prefix = `SPH-${byId(db.regions, regionId)?.code ?? "GEN"}-`;
  const used = new Set([...db.projects.map((p) => p.code.toLowerCase()), ...[...taken].map((c) => c.toLowerCase())]);
  let n = db.projects.filter((p) => p.code.startsWith(prefix)).length + 1;
  while (used.has(`${prefix}${String(n).padStart(2, "0")}`.toLowerCase())) n += 1;
  return `${prefix}${String(n).padStart(2, "0")}`;
}

/** The status new projects start in: the running one, else the first active status. */
export function defaultProjectStatusId(db: Database): string {
  const active = db.projectStatuses.filter((s) => s.isActive).sort((a, b) => a.sequence - b.sequence);
  return (active.find((s) => s.systemKey === "IN_PROGRESS") ?? active[0])?.id ?? "";
}

export type ProjectResult = { project: Project; error: null } | { project?: undefined; error: string };

/**
 * Builds a Project from form values or one CSV record. Customer, site, service line, status, GSTIN and manager
 * are matched by id or name (case-insensitive). `taken` holds codes already used earlier in the same import.
 */
export function buildProject(db: Database, input: Record<string, string>, taken: ReadonlySet<string> = new Set()): ProjectResult {
  const v = canonicalise(input, PROJECT_KEYS);
  const name = v.name ?? "";
  if (!name) return { error: "Project name is required" };

  const site = findRow(db.sites.filter((s) => !s.deletedAt), v.site ?? "", (s) => s.name);
  if (!site) return { error: v.site ? `Site '${v.site}' not found` : "Plant site is required" };

  let organisationId = site.organisationId;
  if (v.customer) {
    const live = db.organisations.filter((o) => !o.deletedAt);
    const org = findRow(live, v.customer, (o) => o.name) ?? findRow(live, v.customer, (o) => o.shortName);
    if (!org) return { error: `Customer '${v.customer}' not found` };
    if (org.id !== site.organisationId) {
      return { error: `Site '${site.name}' belongs to ${byId(db.organisations, site.organisationId)?.name ?? "another customer"}, not '${org.name}'` };
    }
    organisationId = org.id;
  }

  const serviceLine = findRow(db.serviceLines, v.serviceLine ?? "", (s) => s.name);
  if (!serviceLine) return { error: v.serviceLine ? `Service line '${v.serviceLine}' not found` : "Service line is required" };

  const contractType = (v.contractType || "SERVICE").toUpperCase().replace(/[\s-]+/g, "_") as ContractType;
  if (contractType !== "SERVICE" && contractType !== "FIXED_SCOPE") return { error: `Contract type '${v.contractType}' must be SERVICE or FIXED_SCOPE` };
  const cycle = (v.billingCycle || (contractType === "SERVICE" ? "MONTHLY" : "MILESTONE")).toUpperCase().replace(/[\s-]+/g, "_") as BillingCycle;
  if (!BILLING_CYCLES.some((c) => c.value === cycle)) return { error: `Billing cycle '${v.billingCycle}' must be MONTHLY, MILESTONE or ON_COMPLETION` };

  const contractValue = parseMoney(v.contractValue ?? "");
  if (contractValue === undefined || Number(contractValue) <= 0) return { error: "Contract value must be a number greater than 0" };

  const today = getToday();
  const workOrderDate = parseDate(v.workOrderDate ?? "");
  const startDate = parseDate(v.startDate ?? "");
  const plannedEndDate = parseDate(v.plannedEndDate ?? "");
  if (workOrderDate === undefined) return { error: `Work order date '${v.workOrderDate}' is not a valid date (use DD-MM-YYYY)` };
  if (startDate === undefined) return { error: `Start date '${v.startDate}' is not a valid date (use DD-MM-YYYY)` };
  if (plannedEndDate === undefined) return { error: `Planned end date '${v.plannedEndDate}' is not a valid date (use DD-MM-YYYY)` };
  if (startDate && plannedEndDate && plannedEndDate < startDate) return { error: "Planned end date is before the start date" };

  const terms = v.paymentTermsDays ? Number(v.paymentTermsDays) : 30;
  if (!Number.isInteger(terms) || terms < 0 || terms > 365) return { error: "Payment terms must be a whole number of days (0-365)" };

  let gstRegistrationId: string;
  if (v.gstin) {
    const g = findRow(db.gstRegistrations, v.gstin, (x) => x.gstin);
    if (!g) return { error: `GSTIN '${v.gstin}' not found` };
    gstRegistrationId = g.id;
  } else {
    const links = db.regionGstRegistrations.filter((r) => r.regionId === site.regionId);
    gstRegistrationId = (links.find((r) => r.isDefault) ?? links[0])?.gstRegistrationId ?? "";
    if (!gstRegistrationId) return { error: "No GSTIN is set up for this site's region; choose one" };
  }

  let statusId = defaultProjectStatusId(db);
  if (v.status) {
    const s = findRow(db.projectStatuses, v.status, (x) => x.name);
    if (!s) return { error: `Status '${v.status}' not found` };
    statusId = s.id;
  }

  let projectManagerId: string | null = null;
  if (v.projectManager) {
    const e = findRow(db.employees, v.projectManager, (x) => x.name) ?? findRow(db.employees, v.projectManager, (x) => x.code);
    if (!e) return { error: `Project manager '${v.projectManager}' not found` };
    projectManagerId = e.id;
  }

  const code = v.code || nextProjectCode(db, site.regionId, taken);
  if ([...db.projects.map((p) => p.code), ...taken].some((c) => c.toLowerCase() === code.toLowerCase())) return { error: `Code '${code}' is already used` };

  const now = new Date().toISOString();
  return {
    error: null,
    project: {
      id: newId("prj"), createdAt: now, updatedAt: now, deletedAt: null,
      code, name, serviceLineId: serviceLine.id, siteId: site.id, contractType,
      workOrderNo: v.workOrderNo || `WO-${code}`, workOrderDate: workOrderDate ?? today, billingCycle: cycle,
      paymentTermsDays: terms, tenderId: null, organisationId, regionId: site.regionId, gstRegistrationId, contractValue,
      startDate: startDate ?? today, plannedEndDate: plannedEndDate ?? addDays(startDate ?? today, 365),
      statusId, projectManagerId, healthOverride: null,
    },
  };
}

/** Builds every CSV record; rows that fail are reported as "Row N: ..." (N counts the header as row 1). */
export function buildProjects(db: Database, records: Record<string, string>[]): { projects: Project[]; errors: string[] } {
  const projects: Project[] = [];
  const errors: string[] = [];
  const taken = new Set<string>();
  records.forEach((rec, i) => {
    const r = buildProject(db, rec, taken);
    if (r.error !== null) errors.push(`Row ${i + 2}: ${r.error}`);
    else {
      taken.add(r.project.code);
      projects.push(r.project);
    }
  });
  return { projects, errors };
}
