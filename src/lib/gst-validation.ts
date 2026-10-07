/**
 * GSTIN and PAN validation (format, state code, checksum). Pure functions, no I/O.
 * A GSTIN is: 2-digit state code + 10-char PAN + entity number + "Z" + 1 check character.
 */

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** GST state / UT codes in use: 01-38, plus 97 (other territory) and 99 (centre jurisdiction). */
export function isValidGstStateCode(code: string): boolean {
  if (!/^\d{2}$/.test(code)) return false;
  const n = Number(code);
  return (n >= 1 && n <= 38) || n === 97 || n === 99;
}

/** PAN: 5 letters, 4 digits, 1 letter; the 4th letter is the holder type (P person, C company, F firm ...). */
const PAN_RE = /^[A-Z]{3}[ABCFGHJKLPT][A-Z]\d{4}[A-Z]$/;
export const isValidPan = (pan: string): boolean => PAN_RE.test(pan.trim().toUpperCase());

/** Check character for the first 14 characters of a GSTIN (mod-36 weighted sum, weights 1,2,1,2...). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARSET.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

/** Builds a GSTIN with a valid check character. Used by the seed and tests; real GSTINs come from the user. */
export function makeGstin(stateCode: string, pan: string, entityNo = "1"): string {
  const first14 = `${stateCode}${pan.toUpperCase()}${entityNo}Z`;
  return first14 + gstinCheckChar(first14);
}

/** Replaces the last character of a 15-character GSTIN with the correct check character. */
export const withValidCheckChar = (gstin: string): string => gstin.slice(0, 14) + gstinCheckChar(gstin.slice(0, 14));

export const gstinStateCode = (gstin: string): string => gstin.trim().slice(0, 2);
export const gstinPan = (gstin: string): string => gstin.trim().toUpperCase().slice(2, 12);

/** Returns an error message, or null when the GSTIN is well formed and its checksum matches. */
export function gstinError(raw: string): string | null {
  const g = raw.trim().toUpperCase();
  if (g.length !== 15) return "GSTIN must be 15 characters";
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return "GSTIN format is not valid (expected 22AAAAA0000A1Z5)";
  if (!isValidGstStateCode(g.slice(0, 2))) return `GSTIN state code ${g.slice(0, 2)} does not exist`;
  if (!isValidPan(gstinPan(g))) return "The PAN inside the GSTIN is not valid";
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return "GSTIN checksum does not match (check for a typing error)";
  return null;
}

export const isValidGstin = (gstin: string): boolean => gstinError(gstin) === null;
