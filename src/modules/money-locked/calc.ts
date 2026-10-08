// Pure money-locked rules (no DB, no server-only) so they can be unit-tested and used from client components.
import { addMoney, fromPaise, subMoney, toPaise } from "@/lib/money";
import { daysBetween, addDays } from "@/lib/dates";
import type { IsoDate, Money } from "@/types";

export type LockedKind = "EMD" | "PBG" | "ADDITIONAL_PBG" | "SECURITY_DEPOSIT" | "RETENTION";
export type LockedStatus = "LOCKED" | "REFUND_REQUESTED" | "RELEASED" | "FORFEITED";

export const KIND_LABEL: Record<LockedKind, string> = {
  EMD: "EMD",
  PBG: "PBG",
  ADDITIONAL_PBG: "Additional PBG",
  SECURITY_DEPOSIT: "Security deposit",
  RETENTION: "Retention",
};

export const STATUS_LABEL: Record<LockedStatus, string> = {
  LOCKED: "Locked",
  REFUND_REQUESTED: "Refund requested",
  RELEASED: "Released",
  FORFEITED: "Forfeited",
};

export const DEFAULT_EXPIRY_DAYS: readonly number[] = [30, 15, 7];

const RELEASE_EVENTS = new Set(["REFUNDED", "RELEASED", "ADJUSTED"]);
const RELEASE_STATUSES = new Set(["REFUNDED", "RELEASED", "ADJUSTED"]);

/**
 * Ledger status from the instrument status and its latest event.
 * Closing states win (released / forfeited, from either source), then an open refund request, otherwise still locked.
 * ARRANGED / SUBMITTED / EXPIRED are all "locked": an expired guarantee is still money the client holds until it is returned.
 */
export function deriveLockedStatus(status: string, latestEventType?: string | null): LockedStatus {
  if (status === "FORFEITED" || latestEventType === "FORFEITED") return "FORFEITED";
  if (RELEASE_STATUSES.has(status) || (latestEventType != null && RELEASE_EVENTS.has(latestEventType))) return "RELEASED";
  if (latestEventType === "REFUND_REQUESTED") return "REFUND_REQUESTED";
  return "LOCKED";
}

/** Money still tied up with the client. */
export const isOpenStatus = (s: LockedStatus): boolean => s === "LOCKED" || s === "REFUND_REQUESTED";

/**
 * An ARRANGED instrument with no issue date has not gone to the client yet, so it is not "locked" and is left off the ledger.
 */
export function countsAsLocked(status: string, issueDate: IsoDate | null): boolean {
  return !(status === "ARRANGED" && !issueDate);
}

/** Whole days from issue to `until` (today for open items, the closing date for released ones). Never negative; null without an issue date. */
export function daysLocked(issueDate: IsoDate | null, until: IsoDate): number | null {
  if (!issueDate) return null;
  return Math.max(0, daysBetween(issueDate, until));
}

/** Days from `today` to expiry (negative = already expired); null without an expiry date. */
export function daysToExpiry(expiryDate: IsoDate | null, today: IsoDate): number | null {
  if (!expiryDate) return null;
  return daysBetween(today, expiryDate);
}

export type ExpiryAlert = { level: "expired" | "soon"; threshold: number | null } | null;

/**
 * Expiry alert for an OPEN item. `thresholds` (Setting reminders.moneyLockedExpiryDays, default [30,15,7]):
 * the alert's `threshold` is the tightest band the item is inside, e.g. 12 days left with [30,15,7] -> 15.
 */
export function expiryAlert(days: number | null, thresholds: readonly number[] = DEFAULT_EXPIRY_DAYS): ExpiryAlert {
  if (days === null) return null;
  if (days < 0) return { level: "expired", threshold: null };
  const inside = thresholds.filter((t) => days <= t).sort((a, b) => a - b);
  return inside.length ? { level: "soon", threshold: inside[0] } : null;
}

/** Validates the Setting value (a JSON array of positive whole days) and falls back to the default. */
export function parseExpiryThresholds(value: unknown): number[] {
  if (Array.isArray(value)) {
    const ok = value.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0).map(Math.floor);
    if (ok.length) return [...new Set(ok)].sort((a, b) => b - a);
  }
  return [...DEFAULT_EXPIRY_DAYS];
}

export const AGEING_BUCKETS = ["0-30", "31-90", "91-180", "181-365", "365+"] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export function ageingBucket(days: number | null): AgeingBucket | null {
  if (days === null) return null;
  if (days <= 30) return "0-30";
  if (days <= 90) return "31-90";
  if (days <= 180) return "91-180";
  if (days <= 365) return "181-365";
  return "365+";
}

/** Sum of amounts per ageing bucket (open items only; items without an issue date are skipped). */
export function ageingTotals(items: { amount: Money; days: number | null }[]): Record<AgeingBucket, Money> {
  const out = Object.fromEntries(AGEING_BUCKETS.map((b) => [b, "0.00"])) as Record<AgeingBucket, Money>;
  for (const i of items) {
    const b = ageingBucket(i.days);
    if (b) out[b] = addMoney(out[b], i.amount);
  }
  return out;
}

/** A balance delta that starts on `from` and (for locked money) ends on `to` (exclusive). Releases of retention are negative deltas with to = null. */
export interface LockedPeriod {
  amount: Money;
  from: IsoDate | null;
  to: IsoDate | null;
}

/** Last day of "YYYY-MM". */
export function monthEnd(month: string): IsoDate {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return addDays(next, -1);
}

/** The `count` months ending at `month` (inclusive), oldest first. */
export function lastMonths(month: string, count: number): string[] {
  const [y, m] = month.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const idx = y * 12 + (m - 1) - (count - 1 - i);
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
  });
}

/** Locked balance at the end of each month. */
export function lockedSeries(periods: LockedPeriod[], months: string[]): { month: string; total: Money }[] {
  return months.map((month) => {
    const end = monthEnd(month);
    let total = BigInt(0);
    for (const p of periods) {
      if (!p.from || p.from > end) continue;
      if (p.to && p.to <= end) continue;
      total += toPaise(p.amount);
    }
    return { month, total: fromPaise(total) };
  });
}

/** Retention balance held for a project: withheld minus released (never below zero). */
export function retentionBalance(entries: { type: "WITHHELD" | "RELEASED"; amount: Money }[]): Money {
  let bal = "0.00";
  for (const e of entries) bal = e.type === "WITHHELD" ? addMoney(bal, e.amount) : subMoney(bal, e.amount);
  return toPaise(bal) < BigInt(0) ? "0.00" : bal;
}

export interface ClientTotal {
  clientId: string;
  clientName: string;
  total: Money;
  count: number;
  nextExpiry: IsoDate | null;
}

/** Roll-up of ledger rows into per-client totals (open items only), largest first. */
export function totalsByClient(
  rows: { clientId: string; clientName: string; amount: Money; status: LockedStatus; expiryDate: IsoDate | null }[],
): ClientTotal[] {
  const map = new Map<string, ClientTotal>();
  for (const r of rows) {
    if (!isOpenStatus(r.status)) continue;
    const t = map.get(r.clientId) ?? { clientId: r.clientId, clientName: r.clientName, total: "0.00", count: 0, nextExpiry: null };
    t.total = addMoney(t.total, r.amount);
    t.count += 1;
    if (r.expiryDate && (!t.nextExpiry || r.expiryDate < t.nextExpiry)) t.nextExpiry = r.expiryDate;
    map.set(r.clientId, t);
  }
  return [...map.values()].sort((a, b) => (toPaise(b.total) > toPaise(a.total) ? 1 : toPaise(b.total) < toPaise(a.total) ? -1 : 0));
}
