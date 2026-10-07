import { getToday, istToUtc } from "@/lib/dates";
import type { Attendance, AttendanceStatus, Database, Employee, EmployeeProfile, Id, SiteAssignment } from "@/types";

/** Raw, string-valued employee entry (form values or a CSV record). Region, labour type and site may be a name or an id. */
export interface EmployeeEntry {
  name?: string;
  phone?: string;
  code?: string;
  region?: string;
  designation?: string;
  department?: string;
  labourType?: string;
  wage?: string;
  joiningDate?: string;
  pf?: string;
  esi?: string;
  uan?: string;
  advance?: string;
  site?: string;
}

export interface EmployeeRows {
  employee: Employee;
  profile: EmployeeProfile;
  assignment: SiteAssignment | null;
}

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();
const isYes = (v: string | undefined, fallback: boolean) => {
  const s = norm(v);
  if (!s) return fallback;
  return ["yes", "y", "true", "1"].includes(s);
};

/** Accepts DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD and returns YYYY-MM-DD, or null. */
export function parseDateInput(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function money(v: string | undefined): string | null {
  const s = (v ?? "").replace(/[₹,\s]/g, "");
  if (s === "") return "0.00";
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : null;
}

/** Next free "SPH-###" code. */
export function nextEmployeeCode(db: Database, extra: Iterable<string> = []): string {
  let max = 0;
  for (const code of [...db.employees.map((e) => e.code), ...extra]) {
    const m = /^SPH-(\d+)$/i.exec(code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `SPH-${String(max + 1).padStart(3, "0")}`;
}

/** Validates one entry and builds the Employee, EmployeeProfile and optional SiteAssignment rows. Returns a message on failure. */
export function buildEmployee(
  db: Database,
  e: EmployeeEntry,
  ctx: { userId: Id; takenCodes?: Set<string>; code?: string },
): { error: string } | { rows: EmployeeRows } {
  const name = (e.name ?? "").trim();
  if (!name) return { error: "Name is required" };
  const code = (e.code ?? "").trim() || ctx.code || nextEmployeeCode(db, ctx.takenCodes);
  const taken = new Set([...db.employees.filter((x) => !x.deletedAt).map((x) => x.code.toLowerCase()), ...(ctx.takenCodes ?? [])].map((c) => c.toLowerCase()));
  if (taken.has(code.toLowerCase())) return { error: `Employee code '${code}' already exists` };

  const find = <T extends { id: Id; name: string }>(list: T[], v: string | undefined) => list.find((x) => x.id === v?.trim() || norm(x.name) === norm(v));
  const region = find(db.regions, e.region);
  if (!region) return { error: `Region '${e.region ?? ""}' not found` };
  const labour = find(db.labourTypes.filter((l) => l.isActive), e.labourType);
  if (!labour) return { error: `Labour type '${e.labourType ?? ""}' not found` };
  const designation = (e.designation ?? "").trim();
  if (!designation) return { error: "Designation is required" };
  const wage = money(e.wage);
  if (wage === null || Number(wage) <= 0) return { error: `Wage '${e.wage ?? ""}' is not a valid amount` };
  const advance = money(e.advance);
  if (advance === null) return { error: `Advance '${e.advance ?? ""}' is not a valid amount` };
  const joiningDate = e.joiningDate?.trim() ? parseDateInput(e.joiningDate) : getToday();
  if (!joiningDate) return { error: `Joining date '${e.joiningDate}' must be DD-MM-YYYY` };

  let site: { id: Id } | undefined;
  if (e.site?.trim()) {
    site = db.sites.find((s) => !s.deletedAt && (s.id === e.site!.trim() || norm(s.name) === norm(e.site) || norm(s.code) === norm(e.site)));
    if (!site) return { error: `Site '${e.site}' not found` };
  }

  const now = istToUtc(getToday(), "10:30");
  const key = code.toLowerCase().replace(/[^a-z0-9]/g, "");
  const id = `emp_${key}`;
  const employee: Employee = { id, createdAt: now, updatedAt: now, code, name, phone: e.phone?.trim() || null, homeRegionId: region.id, userId: null };
  const profile: EmployeeProfile = {
    id: `ep_${id}`, createdAt: now, updatedAt: now, employeeId: id,
    designation, department: (e.department ?? "").trim() || "Site Operations", labourTypeId: labour.id, joiningDate,
    exitDate: null, wageAmount: wage, pfApplicable: isYes(e.pf, true), esiApplicable: isYes(e.esi, false),
    advanceBalance: advance, uan: e.uan?.trim() || null, contractorId: null,
  };
  let assignment: SiteAssignment | null = null;
  if (site) {
    const project = db.projects.find((p) => p.siteId === site!.id && !p.deletedAt);
    assignment = {
      id: `sa_${id}_${site.id}`, createdAt: now, updatedAt: now, employeeId: id, siteId: site.id, projectId: project?.id ?? "",
      role: designation, fromDate: joiningDate, toDate: null, reason: "Initial assignment", assignedById: ctx.userId,
    };
  }
  return { rows: { employee, profile, assignment } };
}

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "HOLIDAY", "WEEKOFF"];
const FRACTION: Record<AttendanceStatus, number> = { PRESENT: 1, HALF_DAY: 0.5, ABSENT: 0, LEAVE: 0, HOLIDAY: 0, WEEKOFF: 0 };

/** Builds an attendance row from a CSV record (code, date, status). Reuses the existing row's id so re-imports replace, not duplicate. */
export function buildAttendance(db: Database, rec: Record<string, string>, userId: Id): { error: string } | { row: Attendance } {
  const code = (rec.code ?? "").trim();
  const emp = db.employees.find((x) => !x.deletedAt && norm(x.code) === norm(code));
  if (!emp) return { error: `Employee '${code}' not found` };
  const date = parseDateInput(rec.date);
  if (!date) return { error: `Date '${rec.date ?? ""}' must be DD-MM-YYYY or YYYY-MM-DD` };
  if (date > getToday()) return { error: `Date ${rec.date} is in the future` };
  const status = (rec.status ?? "").trim().toUpperCase().replace(/[\s-]/g, "_") as AttendanceStatus;
  if (!ATTENDANCE_STATUSES.includes(status)) return { error: `Status '${rec.status ?? ""}' must be one of ${ATTENDANCE_STATUSES.join(", ")}` };
  const existing = db.attendance.find((a) => a.employeeId === emp.id && a.date === date);
  const assignment =
    db.siteAssignments.find((a) => a.employeeId === emp.id && a.fromDate <= date && (!a.toDate || a.toDate >= date)) ??
    db.siteAssignments.find((a) => a.employeeId === emp.id);
  if (!assignment && !existing) return { error: `Employee '${code}' is not assigned to any site` };
  const siteId = existing?.siteId ?? assignment!.siteId;
  const now = istToUtc(getToday(), "10:30");
  return {
    row: {
      id: existing?.id ?? `att_${emp.id}_${date}`,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      employeeId: emp.id,
      siteId,
      projectId: existing?.projectId ?? assignment!.projectId,
      regionId: db.sites.find((s) => s.id === siteId)?.regionId ?? emp.homeRegionId,
      date,
      status,
      dayFraction: FRACTION[status],
      overtimeMinutes: status === "PRESENT" ? (existing?.overtimeMinutes ?? 0) : 0,
      source: "IMPORT",
      markedById: userId,
      clientUuid: existing?.clientUuid ?? `att-${emp.id}-${date}`,
    },
  };
}
