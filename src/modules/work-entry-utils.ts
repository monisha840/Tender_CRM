import type { Id, IsoDate, Money, Percent } from "@/types";

/** Small parsing helpers shared by the Projects and Subcontractors entry builders (form and CSV import). */

let counter = 0;
/** Unique id for rows created in the browser, e.g. "prj_u_lq3x9a1". */
export function newId(prefix: string): Id {
  counter += 1;
  return `${prefix}_u_${Date.now().toString(36)}${counter.toString(36)}`;
}

/** "Plant site" / "plant_site" / "plantSite" all become "plantsite". */
export const normKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Re-keys a CSV record (human headers) or form record to canonical keys, ignoring case and punctuation. */
export function canonicalise(record: Record<string, string>, keys: readonly string[]): Record<string, string> {
  const byNorm = new Map(keys.map((k) => [normKey(k), k]));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    const canon = byNorm.get(normKey(k));
    if (canon) out[canon] = (v ?? "").trim();
  }
  return out;
}

/** Finds a row by id, or by a name-like field, case-insensitively. */
export function findRow<T extends { id: Id }>(rows: readonly T[], value: string, nameOf: (row: T) => string | undefined | null): T | undefined {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  return rows.find((r) => r.id.toLowerCase() === v) ?? rows.find((r) => (nameOf(r) ?? "").trim().toLowerCase() === v);
}

/** Accepts YYYY-MM-DD or DD-MM-YYYY (also with "/"). Returns null if blank, undefined if invalid. */
export function parseDate(value: string): IsoDate | null | undefined {
  const v = value.trim();
  if (!v) return null;
  let y: string;
  let m: string;
  let d: string;
  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(v);
  if (match) [, y, m, d] = match;
  else if ((match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(v))) [, d, m, y] = match;
  else return undefined;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso ? undefined : iso;
}

/** "2,40,00,000" or "50000.5" to "50000.50". Returns undefined if not a non-negative number. */
export function parseMoney(value: string): Money | undefined {
  const v = value.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return undefined;
  const [i, f = ""] = v.split(".");
  return `${i.replace(/^0+(?=\d)/, "")}.${f.padEnd(2, "0")}`;
}

/** "5" to "5.0000" for 0-100. Returns undefined if invalid. */
export function parsePercent(value: string): Percent | undefined {
  const v = value.replace(/[%\s]/g, "");
  if (!/^\d+(\.\d{1,4})?$/.test(v) || Number(v) > 100) return undefined;
  const [i, f = ""] = v.split(".");
  return `${i}.${f.padEnd(4, "0")}`;
}

export const parseYesNo = (value: string): boolean | undefined => {
  const v = value.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(v)) return true;
  if (["no", "n", "false", "0", ""].includes(v)) return false;
  return undefined;
};
