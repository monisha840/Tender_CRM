/**
 * Invoice numbering. GST rule 46 allows at most 16 characters (letters, digits, "/" and "-").
 * One series per GSTIN per financial year (1 April to 31 March), restarting at 0001 each year:
 *   SPH/MH/2627/0001  = prefix / state code / FY 2026-27 / sequence   (exactly 16 characters)
 */

export const MAX_INVOICE_NO_LENGTH = 16;
export const SEQUENCE_WIDTH = 4;
const SERIES_BRAND = "SPH";

/** Four-digit financial-year code for a pure date: 2026-10-07 and 2027-02-10 are both "2627". */
export function fyCode(date: string): string {
  const y = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}${String((start + 1) % 100).padStart(2, "0")}`;
}

/** "SPH/MH/2627/" for the GSTIN's state code and the invoice date's financial year. */
export const invoiceSeriesPrefix = (stateCode: string, date: string): string => `${SERIES_BRAND}/${stateCode.toUpperCase().slice(0, 2)}/${fyCode(date)}/`;

export const formatInvoiceNo = (prefix: string, seq: number): string => `${prefix}${String(seq).padStart(SEQUENCE_WIDTH, "0")}`;

/** Numeric sequence at the end of a number that starts with `prefix`, else null. */
export function sequenceOf(invoiceNo: string, prefix: string): number | null {
  if (!invoiceNo.startsWith(prefix)) return null;
  const tail = invoiceNo.slice(prefix.length);
  return /^\d+$/.test(tail) ? Number(tail) : null;
}

/** Highest sequence in the series, or 0 when the series has no numbers yet. Compared as numbers, never as strings. */
export function latestSequence(invoiceNos: Iterable<string>, prefix: string): number {
  let max = 0;
  for (const no of invoiceNos) max = Math.max(max, sequenceOf(no, prefix) ?? 0);
  return max;
}

/** Why an invoice number is not acceptable on a GST invoice, or null. */
export function invoiceNoError(no: string): string | null {
  if (no.length > MAX_INVOICE_NO_LENGTH) return `Invoice number must be at most ${MAX_INVOICE_NO_LENGTH} characters (GST rule 46); this one has ${no.length}`;
  if (!/^[A-Za-z0-9/-]+$/.test(no)) return "Invoice number may only contain letters, digits, '/' and '-'";
  return null;
}
