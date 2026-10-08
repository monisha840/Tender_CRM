// Pure bill-readiness logic (no server imports): safe for client components and unit tests.

export const GATE_ITEM_CODE = "GATE_ATTENDANCE";
export const GATE_ITEM_LABEL = "Gate attendance reconciled";

export interface ReadinessItem {
  code: string;
  label: string;
  isMandatory: boolean;
  isDone: boolean;
}

export interface ReadinessResult {
  ready: boolean;
  /** Labels of mandatory items still open, in checklist order. */
  missing: string[];
  done: number;
  total: number;
  /** "Ready to submit" | "Blocked: missing X, Y" | "Checklist not set up". */
  label: string;
}

/** Ready to submit only when every mandatory item is done; otherwise Blocked, naming what is missing. */
export function readinessStatus(items: ReadinessItem[]): ReadinessResult {
  const mandatory = items.filter((i) => i.isMandatory);
  const missing = mandatory.filter((i) => !i.isDone).map((i) => i.label);
  const done = items.filter((i) => i.isDone).length;
  if (mandatory.length === 0) return { ready: false, missing: [], done, total: items.length, label: "Checklist not set up" };
  if (missing.length === 0) return { ready: true, missing, done, total: items.length, label: "Ready to submit" };
  return { ready: false, missing, done, total: items.length, label: `Blocked: missing ${missing.join(", ")}` };
}

/** Standard items offered when the template is empty (editable afterwards). */
export const STANDARD_TEMPLATE: { code: string; label: string }[] = [
  { code: "WAGE_REGISTER", label: "Wage register" },
  { code: "PF_CHALLAN", label: "PF challan" },
  { code: "ESI_CHALLAN", label: "ESI challan" },
  { code: "ATTENDANCE_SHEET", label: "Attendance sheet" },
  { code: "BANK_WAGE_PROOF", label: "Bank wage proof" },
  { code: "LABOUR_LICENCE", label: "Labour licence validity" },
];

export const isPeriodMonth = (v: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
