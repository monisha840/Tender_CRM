import type { Money } from "@/types";

/**
 * Money is a decimal string ("23100000.00"), never a JS float (CLAUDE.md → Money & numbers).
 * Arithmetic runs on integer paise via BigInt, so no extra decimal library is needed for the MVP.
 */

const PAISE = BigInt(100);
const ZERO = BigInt(0);

/** Parse "1234.5", "1234.56", 1234 (integer rupees only) into integer paise. */
export function toPaise(value: Money | number | bigint): bigint {
  if (typeof value === "bigint") return value;
  const raw = typeof value === "number" ? value.toFixed(2) : value.trim();
  const negative = raw.startsWith("-");
  const [whole = "0", frac = ""] = raw.replace(/^[-+]/, "").split(".");
  const paise = BigInt(whole || "0") * PAISE + BigInt((frac + "00").slice(0, 2));
  return negative ? -paise : paise;
}

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

/**
 * Shared INR formatter. Full: ₹2,40,00,000. Compact: ₹2.40 Cr, ₹4.80 L.
 * Tabular numerals are applied by the `.tabular` class, not here.
 */
export function formatINR(value: Money | number | null | undefined, options: FormatINROptions = {}): string {
  if (value === null || value === undefined || value === "") return "—";
  const { compact = false, showPaise } = options;
  const paise = toPaise(value);
  const negative = paise < ZERO;
  const abs = negative ? -paise : paise;
  const sign = negative ? "-" : "";

  const rupees = Number(abs) / 100;
  const wantsCompact = compact === true || (compact === "auto" && rupees >= 100_000);
  if (wantsCompact) {
    if (rupees >= 10_000_000) return `${sign}₹${(rupees / 10_000_000).toFixed(2)} Cr`;
    if (rupees >= 100_000) return `${sign}₹${(rupees / 100_000).toFixed(2)} L`;
  }

  const whole = (abs / PAISE).toString();
  const fraction = abs % PAISE;
  const withPaise = showPaise ?? fraction !== ZERO;
  const frac = withPaise ? `.${fraction.toString().padStart(2, "0")}` : "";
  return `${sign}₹${groupIndian(whole)}${frac}`;
}

/** Axis tick style: "₹2.4 Cr" / "₹80 L" without trailing zeros. */
export function formatINRAxis(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const trim = (n: number) => String(Number(n.toFixed(2)));
  if (abs >= 10_000_000) return `${sign}₹${trim(abs / 10_000_000)} Cr`;
  if (abs >= 100_000) return `${sign}₹${trim(abs / 100_000)} L`;
  if (abs >= 1000) return `${sign}₹${trim(abs / 1000)} K`;
  return `${sign}₹${trim(abs)}`;
}
