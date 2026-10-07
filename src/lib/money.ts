import type { Money } from "@/types";

/**
 * Money is a decimal string ("23100000.00"), never a JS float (CLAUDE.md → Money & numbers).
 * Arithmetic runs on integer paise via BigInt, so no extra decimal library is needed for the MVP.
 */

const PAISE = BigInt(100);
const ZERO = BigInt(0);

/**
 * Parses "1234.5", "1234.567" (rounded half away from zero), 1234.5 or a bigint into integer paise.
 * Returns null for anything that is not a plain decimal: "abc", "1e5", "0x10", NaN, Infinity, "".
 */
export function tryToPaise(value: Money | number | bigint | null | undefined): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) >= 1e15) return null;
    return tryToPaise(value.toFixed(2));
  }
  if (typeof value !== "string") return null;
  const m = /^([-+])?(\d*)(?:\.(\d*))?$/.exec(value.trim());
  if (!m || (!m[2] && !m[3])) return null;
  const frac = (m[3] ?? "").padEnd(3, "0");
  let paise = BigInt(m[2] || "0") * PAISE + BigInt(frac.slice(0, 2));
  if (frac[2] >= "5") paise += BigInt(1);
  return m[1] === "-" ? -paise : paise;
}

/** Like `tryToPaise` but never throws: malformed input counts as zero. Use `tryToPaise` when you must tell the difference. */
export const toPaise = (value: Money | number | bigint): bigint => tryToPaise(value) ?? ZERO;

export function fromPaise(paise: bigint): Money {
  const negative = paise < ZERO;
  const abs = negative ? -paise : paise;
  const whole = abs / PAISE;
  const frac = (abs % PAISE).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${frac}`;
}

export const addMoney = (a: Money, b: Money): Money => fromPaise(toPaise(a) + toPaise(b));
export const subMoney = (a: Money, b: Money): Money => fromPaise(toPaise(a) - toPaise(b));

export function sumMoney(values: Iterable<Money>): Money {
  let total = ZERO;
  for (const v of values) total += toPaise(v);
  return fromPaise(total);
}

/** `percent` is a plain number such as 18 or 2.5; rounds half away from zero to the paisa. */
export function percentOf(amount: Money, percent: number): Money {
  const basisPoints = BigInt(Math.round(percent * 100)); // 2 decimal places of percent
  const product = toPaise(amount) * basisPoints;
  const divisor = BigInt(10000);
  const half = divisor / BigInt(2);
  const rounded = product >= ZERO ? (product + half) / divisor : (product - half) / divisor;
  return fromPaise(rounded);
}

/** Rounds an amount to a whole number of 2 paise (half away from zero), so it can be split into two equal halves. */
export function toEvenPaise(amount: Money): Money {
  const p = toPaise(amount);
  const two = BigInt(2);
  const abs = p < ZERO ? -p : p;
  const even = ((abs + BigInt(1)) / two) * two;
  return fromPaise(p < ZERO ? -even : even);
}

/** Half of an even-paise amount (CGST = SGST exactly). */
export const halfOf = (evenAmount: Money): Money => fromPaise(toPaise(evenAmount) / BigInt(2));

/**
 * Intra-state GST: total tax rounded to an even number of paise so CGST and SGST are exactly equal.
 * Inter-state GST: plain `percentOf`, all IGST.
 */
export function splitGst(taxable: Money, percent: number, intra: boolean): { tax: Money; cgst: Money; sgst: Money; igst: Money } {
  if (!intra) return { tax: percentOf(taxable, percent), cgst: "0.00", sgst: "0.00", igst: percentOf(taxable, percent) };
  const tax = toEvenPaise(percentOf(taxable, percent));
  const half = halfOf(tax);
  return { tax, cgst: half, sgst: half, igst: "0.00" };
}

/** Splits an existing tax amount (such as GST TDS) into CGST/SGST halves or IGST. The split amounts may differ from `amount` by 1 paisa. */
export function splitTaxAmount(amount: Money, intra: boolean): { cgst: Money; sgst: Money; igst: Money } {
  if (!intra) return { cgst: "0.00", sgst: "0.00", igst: amount };
  const half = halfOf(toEvenPaise(amount));
  return { cgst: half, sgst: half, igst: "0.00" };
}

/** Amount still to be received/paid: never negative, so an over-receipt does not produce a negative balance. */
export function outstandingMoney(net: Money, settled: Money): Money {
  const d = toPaise(net) - toPaise(settled);
  return fromPaise(d > ZERO ? d : ZERO);
}

/** True when something is still owed (compared in paise, not as floats). */
export const hasOutstanding = (net: Money, settled: Money): boolean => toPaise(net) > toPaise(settled);

export function cmpMoney(a: Money, b: Money): -1 | 0 | 1 {
  const x = toPaise(a);
  const y = toPaise(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export const isPositive = (m: Money): boolean => toPaise(m) > ZERO;

/** Display/chart use only (never for further arithmetic). */
export function moneyToNumber(m: Money): number {
  return Number(toPaise(m)) / 100;
}

/** Indian digit grouping: 24000000 -> "2,40,00,000". */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

export interface FormatINROptions {
  /** "auto": ₹ Cr / ₹ L at or above ₹1 lakh, full figure below. `true` always compacts. Default false. */
  compact?: boolean | "auto";
  /** Show paise in the full format. Default: only when non-zero. */
  showPaise?: boolean;
}

/** Formats integer hundredths as "12.34". */
const hundredths = (n: bigint): string => `${n / PAISE}.${(n % PAISE).toString().padStart(2, "0")}`;

/**
 * Shared INR formatter. Full: ₹2,40,00,000. Compact: ₹2.40 Cr, ₹4.80 L.
 * Compact rounds first and then picks the unit, so ₹99,99,999.99 shows "₹1.00 Cr", not "₹100.00 L".
 * Malformed input renders "—" instead of throwing.
 * Tabular numerals are applied by the `.tabular` class, not here.
 */
export function formatINR(value: Money | number | null | undefined, options: FormatINROptions = {}): string {
  if (value === null || value === undefined || value === "") return "—";
  const { compact = false, showPaise } = options;
  const paise = tryToPaise(value);
  if (paise === null) return "—";
  const negative = paise < ZERO;
  const abs = negative ? -paise : paise;
  const sign = negative ? "-" : "";

  const LAKH = BigInt(10_000_000); // paise in ₹1 lakh
  const CRORE = BigInt(1_000_000_000);
  const wantsCompact = compact === true || (compact === "auto" && abs >= LAKH);
  if (wantsCompact && abs >= LAKH) {
    const lakhs = (abs * PAISE + LAKH / BigInt(2)) / LAKH; // hundredths of a lakh, rounded
    if (abs >= CRORE || lakhs >= BigInt(10_000)) {
      const crores = (abs * PAISE + CRORE / BigInt(2)) / CRORE;
      return `${sign}₹${hundredths(crores)} Cr`;
    }
    return `${sign}₹${hundredths(lakhs)} L`;
  }

  const whole = (abs / PAISE).toString();
  const fraction = abs % PAISE;
  const withPaise = showPaise ?? fraction !== ZERO;
  const frac = withPaise ? `.${fraction.toString().padStart(2, "0")}` : "";
  return `${sign}₹${groupIndian(whole)}${frac}`;
}

/** Axis tick style: "₹2.4 Cr" / "₹80 L" without trailing zeros. */
export function formatINRAxis(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const trim = (n: number) => String(Number(n.toFixed(2)));
  if (abs >= 10_000_000) return `${sign}₹${trim(abs / 10_000_000)} Cr`;
  if (abs >= 100_000) return `${sign}₹${trim(abs / 100_000)} L`;
  if (abs >= 1000) return `${sign}₹${trim(abs / 1000)} K`;
  return `${sign}₹${trim(abs)}`;
}
