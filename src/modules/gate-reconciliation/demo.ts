// Offline generator of the DEMO gate attendance file (an NTPC CLIMS-style export). It derives the file from the deterministic
// seed (no database access) and plants a known set of mismatches, so the reconciliation can be demonstrated and tested.
import { toCsv } from "@/lib/csv";
import { buildSeedDatabase } from "@/lib/data/seed";
import { ourHours, type OurAttendance, type OurEmployee } from "./match";

export const DEMO_PROJECT_KEY = "p1_ntpc_stone";
export const DEMO_PROJECT_ID = `prj_${DEMO_PROJECT_KEY}`;
export const DEMO_PROJECT_CODE = "SPH-CG-001";
export const DEMO_PERIOD = "2026-08";
export const DEMO_HEADERS = ["Worker ID", "Worker Name", "Date", "In Time", "Out Time", "Hours", "Shift"] as const;

export interface DemoGate {
  headers: string[];
  rows: string[][];
  csv: string;
  ours: OurAttendance[];
  employees: OurEmployee[];
  /** What reconciling this file against the seed must report. */
  expected: { missingInOurs: number; missingInTheirs: number; hoursMismatch: number; shiftMismatch: number; exceptions: number; matched: number; compared: number };
}

const pad = (n: number) => String(n).padStart(2, "0");
const dmy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const clock = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
const hoursStr = (h: number) => (Number.isInteger(h) ? h.toFixed(1) : String(h));

/** Planned mismatches: 3 missing in ours, 4 missing in theirs, 2 hours, 2 shift. */
export const DEMO_PLAN = { missingInOurs: 3, missingInTheirs: 4, hoursMismatch: 2, shiftMismatch: 2 } as const;

export function buildDemoGate(): DemoGate {
  const db = buildSeedDatabase();
  const prefix = `emp_w_${DEMO_PROJECT_KEY}_`;
  const employees: OurEmployee[] = db.employees.filter((e) => e.id.startsWith(prefix)).map((e) => ({ id: e.id, code: e.code, name: e.name }));
  const empById = new Map(employees.map((e) => [e.id, e]));
  const att = db.attendance.filter((a) => a.projectId === DEMO_PROJECT_ID && a.date.startsWith(DEMO_PERIOD) && empById.has(a.employeeId));
  const ours: OurAttendance[] = att.map((a) => ({ employeeId: a.employeeId, date: a.date, dayFraction: Number(a.dayFraction), overtimeMinutes: a.overtimeMinutes }));

  const worked = att
    .filter((a) => ourHours({ dayFraction: Number(a.dayFraction), overtimeMinutes: a.overtimeMinutes }) > 0)
    .sort((x, y) => x.date.localeCompare(y.date) || empById.get(x.employeeId)!.code.localeCompare(empById.get(y.employeeId)!.code));
  const idle = att.filter((a) => Number(a.dayFraction) === 0 && a.status !== "WEEKOFF").sort((x, y) => x.date.localeCompare(y.date) || x.employeeId.localeCompare(y.employeeId));

  // Distinct, evenly spread positions in the worked list for each planted mismatch.
  const used = new Set<number>();
  const pick = (fraction: number, ok: (i: number) => boolean = () => true): number => {
    let i = Math.floor(worked.length * fraction);
    while (used.has(i) || !ok(i)) i = (i + 1) % worked.length;
    used.add(i);
    return i;
  };
  const dropped = new Set([pick(0.12), pick(0.32), pick(0.52), pick(0.72)]);
  const hoursUp = pick(0.22);
  const hoursDown = pick(0.62, (i) => ourHours({ dayFraction: Number(worked[i].dayFraction), overtimeMinutes: worked[i].overtimeMinutes }) >= 4);
  const nightA = pick(0.42);
  const nightB = pick(0.82);

  type Out = { code: string; name: string; date: string; inMin: number; hours: number; shift: string };
  const out: Out[] = [];
  worked.forEach((a, i) => {
    if (dropped.has(i)) return;
    const emp = empById.get(a.employeeId)!;
    let hours = ourHours({ dayFraction: Number(a.dayFraction), overtimeMinutes: a.overtimeMinutes });
    let shift = Number(a.dayFraction) < 1 ? "H" : "G";
    if (i === hoursUp) hours = Math.round((hours + 1.5) * 100) / 100;
    if (i === hoursDown) hours = Math.round((hours - 2) * 100) / 100;
    if (i === nightA || i === nightB) shift = "N";
    out.push({ code: emp.code, name: emp.name, date: a.date, inMin: shift === "N" ? 22 * 60 : 8 * 60, hours, shift });
  });
  // Present at the gate on a day we marked absent / on leave.
  [Math.floor(idle.length * 0.3), Math.floor(idle.length * 0.7)].forEach((idx, k) => {
    const a = idle[idx];
    const emp = empById.get(a.employeeId)!;
    out.push({ code: emp.code, name: emp.name, date: a.date, inMin: 8 * 60, hours: k === 0 ? 8 : 4, shift: k === 0 ? "G" : "H" });
  });
  // A badge that is not one of our workers at all.
  out.push({ code: "GX-9001", name: "Unregistered Worker", date: `${DEMO_PERIOD}-14`, inMin: 8 * 60, hours: 8, shift: "G" });

  out.sort((x, y) => x.date.localeCompare(y.date) || x.code.localeCompare(y.code));
  const rows = out.map((o) => [o.code, o.name, dmy(o.date), clock(o.inMin), clock(o.inMin + Math.round(o.hours * 60)), hoursStr(o.hours), o.shift]);
  const baseMatched = worked.length - dropped.size - 2 /* hours */ - 2; /* shift */
  return {
    headers: [...DEMO_HEADERS],
    rows,
    csv: toCsv([...DEMO_HEADERS], rows),
    ours,
    employees,
    expected: {
      ...DEMO_PLAN,
      exceptions: DEMO_PLAN.missingInOurs + DEMO_PLAN.missingInTheirs + DEMO_PLAN.hoursMismatch + DEMO_PLAN.shiftMismatch,
      matched: baseMatched,
      compared: baseMatched + 11,
    },
  };
}
