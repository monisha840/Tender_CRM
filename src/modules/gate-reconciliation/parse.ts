// Pure parsing of a client's gate attendance export (CSV text or a spreadsheet grid). Browser and server safe.

export const DATE_FORMATS = ["DD-MM-YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY", "DD-MMM-YYYY"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** Which source column (by header text) feeds each field. Only workerRef and date are mandatory; one of hours or in/out is needed. */
export interface ColumnMap {
  workerRef: string;
  workerName?: string | null;
  date: string;
  inTime?: string | null;
  outTime?: string | null;
  hours?: string | null;
  shift?: string | null;
}
export const MAP_FIELDS: { key: keyof ColumnMap; label: string; required: boolean }[] = [
  { key: "workerRef", label: "Worker ref / ID", required: true },
  { key: "workerName", label: "Worker name", required: false },
  { key: "date", label: "Date", required: true },
  { key: "inTime", label: "In time", required: false },
  { key: "outTime", label: "Out time", required: false },
  { key: "hours", label: "Hours", required: false },
  { key: "shift", label: "Shift", required: false },
];

export interface GateRow {
  workerRef: string;
  workerName: string | null;
  /** YYYY-MM-DD */
  date: string;
  inTime: string | null;
  outTime: string | null;
  /** Hours worked per the gate; null when neither an hours nor an in/out column gave a value. */
  hours: number | null;
  shift: string | null;
}
export interface ParseIssue {
  /** 1-based line in the file (header is line 1). */
  line: number;
  message: string;
}

/** RFC-4180 CSV text to a grid of trimmed cells; blank lines dropped. */
export function csvToGrid(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Best-guess mapping from header names (used to pre-fill the mapping dialog). */
export function autoDetectMapping(headers: string[]): Partial<ColumnMap> {
  const find = (...patterns: RegExp[]) => headers.find((h) => patterns.some((p) => p.test(norm(h)))) ?? null;
  const out: Partial<ColumnMap> = {};
  const set = <K extends keyof ColumnMap>(k: K, v: string | null) => {
    if (v) out[k] = v as ColumnMap[K];
  };
  set("workerRef", find(/^(workerid|workerref|empcode|employeecode|empid|employeeid|badge(no|id)?|cardno|workercode|contractworkerid|uid|id)$/, /(workerid|empcode|employeecode|badgeno|cardno)/));
  set("workerName", find(/^(name|workername|employeename|empname|workman)$/, /(workername|employeename|empname)/));
  set("date", find(/^(date|attendancedate|punchdate|workdate|day)$/, /date/));
  set("inTime", find(/^(in|intime|timein|checkin|punchin|entry|entrytime|firstin)$/, /(intime|checkin|punchin)/));
  set("outTime", find(/^(out|outtime|timeout|checkout|punchout|exit|exittime|lastout)$/, /(outtime|checkout|punchout)/));
  set("hours", find(/^(hours|hrs|workhours|workinghours|totalhours|duration|hoursworked|workedhours)$/, /(hours|hrs)/));
  set("shift", find(/^(shift|shiftcode|shiftname)$/, /shift/));
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

function validYmd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Excel serial day number (1900 system) to YYYY-MM-DD. */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Parses a date cell in the mapping's format (also ISO and Excel serials, which spreadsheets produce regardless of format). */
export function parseDateValue(raw: string, format: DateFormat = "DD-MM-YYYY"): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToIso(Number(s));
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (iso) return validYmd(+iso[1], +iso[2], +iso[3]);
  const named = /^(\d{1,2})[-/ .]([A-Za-z]{3})[A-Za-z]*[-/ .,]+(\d{2,4})$/.exec(s);
  if (named) {
    const m = MONTHS.indexOf(named[2].toLowerCase()) + 1;
    const y = +named[3] < 100 ? 2000 + +named[3] : +named[3];
    return m ? validYmd(y, m, +named[1]) : null;
  }
  const num = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s.*)?$/.exec(s);
  if (num) {
    const a = +num[1];
    const b = +num[2];
    const y = +num[3] < 100 ? 2000 + +num[3] : +num[3];
    return format === "MM/DD/YYYY" ? validYmd(y, a, b) : validYmd(y, b, a);
  }
  return null;
}

/** "08:30", "8:30 AM", "20:15:00", a spreadsheet day fraction ("0.354") or a datetime; to minutes since midnight. */
export function parseClock(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const hm = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?\s*$/.exec(s);
  if (hm) {
    let h = +hm[1];
    const m = +hm[2];
    if (hm[3]) {
      const pm = hm[3].toLowerCase() === "pm";
      if (h === 12) h = pm ? 12 : 0;
      else if (pm) h += 12;
    }
    return h > 23 || m > 59 ? null : h * 60 + m;
  }
  if (/^0?\.\d+$/.test(s) || /^\d\.\d+$/.test(s)) {
    const f = Number(s);
    return f >= 0 && f < 1 ? Math.round(f * 1440) : null;
  }
  return null;
}

const fmtClock = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

/** Hours worked from in/out clock times, allowing a night shift that crosses midnight. */
export function hoursBetween(inTime: string | null, outTime: string | null): number | null {
  if (!inTime || !outTime) return null;
  const a = parseClock(inTime);
  const b = parseClock(outTime);
  if (a === null || b === null) return null;
  const diff = b >= a ? b - a : b + 1440 - a;
  return Math.round((diff / 60) * 100) / 100;
}

/** "8", "8.5", "8:30" (hh:mm) to decimal hours. */
export function parseHours(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const hm = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (hm) return Math.round((+hm[1] + +hm[2] / 60) * 100) / 100;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 24 ? Math.round(n * 100) / 100 : null;
}

export interface ParsedGate {
  rows: GateRow[];
  issues: ParseIssue[];
  /** Header cells that the mapping names but the file does not have. */
  missingColumns: string[];
}

/** Turns a grid (first row = headers) into gate rows using the saved/typed column mapping. */
export function parseGateGrid(grid: string[][], map: ColumnMap, dateFormat: DateFormat = "DD-MM-YYYY"): ParsedGate {
  const [head, ...body] = grid;
  const issues: ParseIssue[] = [];
  const missingColumns: string[] = [];
  if (!head) return { rows: [], issues: [{ line: 1, message: "The file is empty" }], missingColumns };
  const index = new Map(head.map((h, i) => [norm(h), i]));
  const col = (name: string | null | undefined): number | null => {
    if (!name) return null;
    const i = index.get(norm(name));
    if (i === undefined) {
      if (!missingColumns.includes(name)) missingColumns.push(name);
      return null;
    }
    return i;
  };
  const c = {
    workerRef: col(map.workerRef), workerName: col(map.workerName), date: col(map.date),
    inTime: col(map.inTime), outTime: col(map.outTime), hours: col(map.hours), shift: col(map.shift),
  };
  if (c.workerRef === null || c.date === null) return { rows: [], issues: [{ line: 1, message: "Worker ref and date columns must be mapped to columns in this file" }], missingColumns };

  const rows: GateRow[] = [];
  body.forEach((cells, i) => {
    const line = i + 2;
    const at = (k: number | null) => (k === null ? "" : (cells[k] ?? "").trim());
    const ref = at(c.workerRef);
    if (!ref && !at(c.date)) return;
    if (!ref) return void issues.push({ line, message: "Worker ref is blank" });
    const date = parseDateValue(at(c.date), dateFormat);
    if (!date) return void issues.push({ line, message: `Date "${at(c.date)}" is not ${dateFormat}` });
    const inTime = at(c.inTime) || null;
    const outTime = at(c.outTime) || null;
    const hours = (c.hours !== null ? parseHours(at(c.hours)) : null) ?? hoursBetween(inTime, outTime);
    const inClock = inTime ? parseClock(inTime) : null;
    const outClock = outTime ? parseClock(outTime) : null;
    rows.push({
      workerRef: ref, workerName: at(c.workerName) || null, date,
      inTime: inClock === null ? inTime : fmtClock(inClock), outTime: outClock === null ? outTime : fmtClock(outClock),
      hours, shift: at(c.shift) || null,
    });
  });
  return { rows, issues, missingColumns };
}

/** Canonical shift label used for comparison; null when blank or unrecognised (then no shift check is made). */
export type ShiftLabel = "GENERAL" | "HALF" | "EVENING" | "NIGHT";
export function normaliseShift(raw: string | null | undefined): ShiftLabel | null {
  const s = (raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return null;
  if (/^(H|HALF|HD|HALFDAY|HALFSHIFT)$/.test(s)) return "HALF";
  if (/^(N|C|3|NIGHT|THIRD|NS)$/.test(s)) return "NIGHT";
  if (/^(B|2|EVENING|SECOND|AFTERNOON|SWING)$/.test(s)) return "EVENING";
  if (/^(G|GEN|GENERAL|DAY|A|1|FIRST|MORNING|FULL|FULLDAY|FULLSHIFT)$/.test(s)) return "GENERAL";
  return null;
}
