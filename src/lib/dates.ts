import type { IsoDate, IsoDateTime } from "@/types";

/**
 * Timestamps are UTC; display is Asia/Kolkata in DD-MM-YYYY (CLAUDE.md → Dates).
 * Pure dates ("YYYY-MM-DD") are handled as calendar days with no timezone shifting.
 */

export const APP_TIME_ZONE = "Asia/Kolkata";

/**
 * "Today" for the mock-data MVP. Seed data is generated relative to this anchor so deadlines,
 * overdue items and charts always look current and the app is deterministic.
 * When a backend lands, replace the body with the real IST date.
 */
export const DEMO_TODAY: IsoDate = "2026-10-07";
export const getToday = (): IsoDate => DEMO_TODAY;

const MS_PER_DAY = 86_400_000;

function parseIsoDate(date: IsoDate): number {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatIsoDate(ms: number): IsoDate {
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

export const addDays = (date: IsoDate, days: number): IsoDate => formatIsoDate(parseIsoDate(date) + days * MS_PER_DAY);

/** Whole days from `from` to `to` (positive when `to` is later). */
export const daysBetween = (from: IsoDate, to: IsoDate): number =>
  Math.round((parseIsoDate(to) - parseIsoDate(from)) / MS_PER_DAY);

/** Day of week for a pure date: 0 = Sunday. */
export const dayOfWeek = (date: IsoDate): number => new Date(parseIsoDate(date)).getUTCDay();

/** "YYYY-MM" for a pure date. */
export const monthOf = (date: IsoDate): string => date.slice(0, 7);

const istParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function istPartsOf(dateTime: IsoDateTime) {
  const parts = Object.fromEntries(istParts.formatToParts(new Date(dateTime)).map((p) => [p.type, p.value]));
  return { y: parts.year, m: parts.month, d: parts.day, h: parts.hour, min: parts.minute };
}

/** IST calendar date of a UTC timestamp. */
export function toIstDate(dateTime: IsoDateTime): IsoDate {
  const { y, m, d } = istPartsOf(dateTime);
  return `${y}-${m}-${d}`;
}

/** IST wall-clock → UTC ISO timestamp. IST is a fixed UTC+05:30 (no DST). */
export function istToUtc(date: IsoDate, time = "00:00"): IsoDateTime {
  const [h, m] = time.split(":").map(Number);
  return new Date(parseIsoDate(date) + (h * 60 + m - 330) * 60_000).toISOString();
}

/** DD-MM-YYYY. Accepts a pure date or a UTC timestamp (converted to IST). */
export function formatDate(value: IsoDate | IsoDateTime | null | undefined): string {
  if (!value) return "—";
  const date = value.length > 10 ? toIstDate(value) : value;
  const [y, m, d] = date.split("-");
  return `${d}-${m}-${y}`;
}

/** DD-MM-YYYY, HH:mm (IST). */
export function formatDateTime(value: IsoDateTime | null | undefined): string {
  if (!value) return "—";
  const { y, m, d, h, min } = istPartsOf(value);
  return `${d}-${m}-${y}, ${h}:${min}`;
}

export type DeadlineTone = "overdue" | "urgent" | "soon" | "normal";

export interface RelativeDeadline {
  days: number;
  label: string;
  tone: DeadlineTone;
}

/**
 * Relative label for a deadline: "Today", "Tomorrow", "in 3 days", "2 days overdue".
 * urgent ≤ 3 days, soon ≤ 7 days (matching the default 7/3/1 reminder periods).
 */
export function relativeDeadline(value: IsoDate | IsoDateTime, today: IsoDate = getToday()): RelativeDeadline {
  const date = value.length > 10 ? toIstDate(value) : value;
  const days = daysBetween(today, date);
  if (days < 0) return { days, label: `${-days} day${days === -1 ? "" : "s"} overdue`, tone: "overdue" };
  if (days === 0) return { days, label: "Today", tone: "urgent" };
  if (days === 1) return { days, label: "Tomorrow", tone: "urgent" };
  return { days, label: `in ${days} days`, tone: days <= 3 ? "urgent" : days <= 7 ? "soon" : "normal" };
}

/** Last `count` calendar days ending at `end` (inclusive), oldest first. */
export function lastNDays(count: number, end: IsoDate = getToday()): IsoDate[] {
  return Array.from({ length: count }, (_, i) => addDays(end, i - (count - 1)));
}

/** The last `count` months ("YYYY-MM") ending with the month of `end`, oldest first. */
export function lastNMonths(count: number, end: IsoDate = getToday()): string[] {
  const [y, m] = end.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const idx = y * 12 + (m - 1) - (count - 1 - i);
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
  });
}

/** 15th of the month after `period` ("YYYY-MM"): the PF/ESI payment due date. */
export function nextMonth15th(period: string): IsoDate {
  const [y, m] = period.split("-").map(Number);
  const idx = y * 12 + m; // zero-based index of the month after `period`
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-15`;
}

/** "Oct 2026" style label for a "YYYY-MM" period. */
export function formatMonth(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[m - 1]} ${y}`;
}
