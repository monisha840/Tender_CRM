// Pure matching engine: the client's gate rows vs our attendance, per worker per day. No I/O.
import { normaliseShift, type GateRow, type ShiftLabel } from "./parse";

export const EXCEPTION_KINDS = ["MISSING_IN_OURS", "MISSING_IN_THEIRS", "HOURS_MISMATCH", "SHIFT_MISMATCH"] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export const KIND_LABEL: Record<ExceptionKind, string> = {
  MISSING_IN_OURS: "Missing in our attendance",
  MISSING_IN_THEIRS: "Missing at their gate",
  HOURS_MISMATCH: "Hours differ",
  SHIFT_MISMATCH: "Shift differs",
};

export interface OurAttendance {
  employeeId: string;
  /** YYYY-MM-DD */
  date: string;
  dayFraction: number;
  overtimeMinutes: number;
}
export interface OurEmployee {
  id: string;
  code: string;
  name: string;
}

export interface ReconcileOptions {
  /** Gate hours and ours may differ by up to this many hours (Setting gate.hoursToleranceHrs, default 0.5). */
  toleranceHrs: number;
  /** Hours in one full day (dayFraction 1). Default 8. */
  shiftHours: number;
}
export const DEFAULT_OPTIONS: ReconcileOptions = { toleranceHrs: 0.5, shiftHours: 8 };

export interface GateException {
  kind: ExceptionKind;
  date: string;
  workerRef: string;
  workerName: string | null;
  employeeId: string | null;
  ourHours: number | null;
  theirHours: number | null;
  reason: string;
}

export interface ReconcileResult {
  /** Worker-days present on both sides and agreeing. */
  matched: number;
  /** Worker-days compared (matched + every exception). */
  compared: number;
  exceptions: GateException[];
  /** Gate rows that fell outside the month and were ignored. */
  outOfPeriod: number;
  /** Matched share of compared worker-days, 0-100 (100 when nothing to compare). */
  matchedPct: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
export const ourHours = (a: Pick<OurAttendance, "dayFraction" | "overtimeMinutes">, shiftHours = 8) =>
  round2(a.dayFraction * shiftHours + a.overtimeMinutes / 60);

/** The shift our records imply: a half day is HALF, anything else is GENERAL. */
export const ourShift = (a: Pick<OurAttendance, "dayFraction">): ShiftLabel => (a.dayFraction > 0 && a.dayFraction < 1 ? "HALF" : "GENERAL");

const normName = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const normCode = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Resolves a gate worker to one of our employees: by code first, then by exact normalised name. */
export function makeResolver(employees: OurEmployee[]) {
  const byCode = new Map(employees.map((e) => [normCode(e.code), e]));
  const byName = new Map<string, OurEmployee | null>();
  for (const e of employees) {
    const k = normName(e.name);
    byName.set(k, byName.has(k) ? null : e); // ambiguous names never match
  }
  return (ref: string, name: string | null): OurEmployee | null => byCode.get(normCode(ref)) ?? (name ? (byName.get(normName(name)) ?? null) : null);
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

export function reconcile(
  gate: GateRow[],
  ours: OurAttendance[],
  employees: OurEmployee[],
  periodMonth: string,
  options: Partial<ReconcileOptions> = {},
): ReconcileResult {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  const resolve = makeResolver(employees);
  const empById = new Map(employees.map((e) => [e.id, e]));

  type Side = { hours: number; shift: ShiftLabel | null; ref: string; name: string | null };
  const theirs = new Map<string, Side & { employeeId: string | null; date: string }>();
  let outOfPeriod = 0;
  for (const g of gate) {
    if (!g.date.startsWith(periodMonth)) {
      outOfPeriod++;
      continue;
    }
    const emp = resolve(g.workerRef, g.workerName);
    const who = emp ? `e:${emp.id}` : `r:${normCode(g.workerRef)}`;
    const key = `${who}|${g.date}`;
    const hours = g.hours ?? opt.shiftHours;
    const prev = theirs.get(key);
    if (prev) {
      prev.hours = round2(prev.hours + hours); // several swipes in a day add up
      prev.shift = prev.shift ?? normaliseShift(g.shift);
    } else {
      theirs.set(key, { hours, shift: normaliseShift(g.shift), ref: g.workerRef, name: g.workerName, employeeId: emp?.id ?? null, date: g.date });
    }
  }

  const mine = new Map<string, { hours: number; shift: ShiftLabel; employeeId: string; date: string }>();
  for (const a of ours) {
    if (!a.date.startsWith(periodMonth)) continue;
    const hours = ourHours(a, opt.shiftHours);
    if (hours <= 0) continue; // absent / leave / week-off: nothing worked
    const key = `e:${a.employeeId}|${a.date}`;
    const prev = mine.get(key);
    if (prev) prev.hours = round2(prev.hours + hours);
    else mine.set(key, { hours, shift: ourShift(a), employeeId: a.employeeId, date: a.date });
  }

  const exceptions: GateException[] = [];
  let matched = 0;
  for (const [key, t] of theirs) {
    if (t.hours <= 0) continue; // a gate row with zero hours is not presence
    const o = mine.get(key);
    if (!o) {
      exceptions.push({
        kind: "MISSING_IN_OURS", date: t.date, workerRef: t.ref, workerName: t.name ?? (t.employeeId ? empById.get(t.employeeId)?.name ?? null : null), employeeId: t.employeeId,
        ourHours: null, theirHours: t.hours,
        reason: t.employeeId ? `Client gate shows ${fmt(t.hours)} h, but we have no attendance for this day.` : `Client gate shows ${fmt(t.hours)} h for ${t.ref}, who is not on our employee list for this project.`,
      });
      continue;
    }
    if (Math.abs(o.hours - t.hours) > opt.toleranceHrs + 1e-9) {
      exceptions.push({
        kind: "HOURS_MISMATCH", date: t.date, workerRef: t.ref, workerName: t.name ?? empById.get(o.employeeId)?.name ?? null, employeeId: o.employeeId,
        ourHours: o.hours, theirHours: t.hours,
        reason: `Gate ${fmt(t.hours)} h vs ours ${fmt(o.hours)} h (difference ${fmt(round2(Math.abs(o.hours - t.hours)))} h, tolerance ${fmt(opt.toleranceHrs)} h).`,
      });
      continue;
    }
    if (t.shift && t.shift !== o.shift) {
      exceptions.push({
        kind: "SHIFT_MISMATCH", date: t.date, workerRef: t.ref, workerName: t.name ?? empById.get(o.employeeId)?.name ?? null, employeeId: o.employeeId,
        ourHours: o.hours, theirHours: t.hours,
        reason: `Gate shift ${t.shift.toLowerCase()} vs ours ${o.shift.toLowerCase()}.`,
      });
      continue;
    }
    matched++;
  }
  for (const [key, o] of mine) {
    const t = theirs.get(key);
    if (t && t.hours > 0) continue;
    const emp = empById.get(o.employeeId);
    exceptions.push({
      kind: "MISSING_IN_THEIRS", date: o.date, workerRef: emp?.code ?? o.employeeId, workerName: emp?.name ?? null, employeeId: o.employeeId,
      ourHours: o.hours, theirHours: null,
      reason: `We recorded ${fmt(o.hours)} h, but the client gate has no entry for this day.`,
    });
  }

  exceptions.sort((a, b) => a.date.localeCompare(b.date) || a.workerRef.localeCompare(b.workerRef) || a.kind.localeCompare(b.kind));
  const compared = matched + exceptions.length;
  return { matched, compared, exceptions, outOfPeriod, matchedPct: compared === 0 ? 100 : Math.round((matched / compared) * 1000) / 10 };
}

/** One-line summary for lists: "97% matched, 14 exceptions". */
export function summaryText(matchedPct: number, exceptions: number): string {
  return `${fmt(matchedPct)}% matched, ${exceptions} exception${exceptions === 1 ? "" : "s"}`;
}
