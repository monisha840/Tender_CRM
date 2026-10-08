import "server-only";
import { prisma } from "@/lib/server/prisma";
import type { Tx } from "@/lib/server/audit";
import { getSettingValue } from "@/lib/server/settings-read";
import { runAction, ServiceError, updateWithVersion, type UserResolver } from "@/lib/server/service";
import { addMoney, fromPaise, toPaise } from "@/lib/money";
import { toIstDate } from "@/lib/dates";
import type { IsoDate, Money } from "@/types";
import {
  countsAsLocked,
  daysLocked,
  daysToExpiry,
  deriveLockedStatus,
  expiryAlert,
  isOpenStatus,
  lastMonths,
  lockedSeries,
  parseExpiryThresholds,
  retentionBalance,
  totalsByClient,
  type ClientTotal,
  type ExpiryAlert,
  type LockedKind,
  type LockedPeriod,
  type LockedStatus,
} from "./calc";
import { instrumentActionSchema } from "./schema";

export const EXPIRY_SETTING_KEY = "reminders.moneyLockedExpiryDays";

const iso = (d: Date | null | undefined): IsoDate | null => (d ? d.toISOString().slice(0, 10) : null);
export const todayIst = (): IsoDate => toIstDate(new Date().toISOString());

/** One ledger line. Plain strings/numbers only, so it can cross to client components. */
export interface LedgerRow {
  /** SecurityInstrument id, or "ret:<projectId>" for the retention balance of a project. */
  id: string;
  kind: LockedKind;
  clientId: string;
  clientName: string;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  tenderNo: string | null;
  reference: string | null;
  amount: Money;
  issueDate: IsoDate | null;
  expiryDate: IsoDate | null;
  status: LockedStatus;
  /** Days from issue to today (open) or to the closing date (released / forfeited). */
  daysLocked: number | null;
  daysToExpiry: number | null;
  alert: ExpiryAlert;
  /** Optimistic-lock version of the instrument; null for retention rows (read-only). */
  version: number | null;
  /** True when refund / release can be recorded (open instrument; retention rows are read-only). */
  canAct: boolean;
}

export interface Ledger {
  today: IsoDate;
  thresholds: number[];
  rows: LedgerRow[];
}

export interface MoneyLockedSummary {
  asOf: IsoDate;
  total: Money;
  count: number;
  /** Open items inside an expiry-alert band, or already expired. */
  expiringCount: number;
  perClient: ClientTotal[];
  /** Locked balance at each month end, oldest first (12 months). */
  series: { month: string; total: Money }[];
}

const CLOSING = new Set(["REFUNDED", "RELEASED", "ADJUSTED", "FORFEITED"]);

async function loadInstruments() {
  return prisma.securityInstrument.findMany({
    where: { deletedAt: null },
    include: {
      tender: { select: { tenderNo: true, organisationId: true, organisation: { select: { name: true } } } },
      project: { select: { id: true, code: true, name: true, organisationId: true, organisation: { select: { name: true } } } },
      events: { where: { deletedAt: null }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
  });
}
type InstrumentWithRefs = Awaited<ReturnType<typeof loadInstruments>>[number];

/** Date the money stopped being locked: the last closing event, else the last update. */
function closedOn(i: InstrumentWithRefs): IsoDate {
  const closing = [...i.events].reverse().find((e) => CLOSING.has(e.type));
  return iso(closing?.date) ?? toIstDate(i.updatedAt.toISOString());
}

/** Every EMD, PBG / additional PBG, security deposit and client retention balance, with derived status. */
export async function loadLedger(today: IsoDate = todayIst()): Promise<Ledger> {
  const thresholds = parseExpiryThresholds(await getSettingValue<unknown>(EXPIRY_SETTING_KEY, [30, 15, 7]));
  const [instruments, retention] = await Promise.all([
    loadInstruments(),
    prisma.retentionEntry.findMany({
      where: { deletedAt: null, side: "CLIENT" },
      select: {
        projectId: true,
        type: true,
        amount: true,
        date: true,
        project: { select: { code: true, name: true, organisationId: true, organisation: { select: { name: true } } } },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const rows: LedgerRow[] = [];
  for (const i of instruments) {
    const issueDate = iso(i.issueDate);
    if (!countsAsLocked(i.status, issueDate)) continue;
    const status = deriveLockedStatus(i.status, i.events.at(-1)?.type ?? null);
    const open = isOpenStatus(status);
    const dte = daysToExpiry(iso(i.expiryDate), today);
    rows.push({
      id: i.id,
      kind: i.type,
      clientId: i.project?.organisationId ?? i.tender.organisationId,
      clientName: i.project?.organisation.name ?? i.tender.organisation.name,
      projectId: i.project?.id ?? null,
      projectCode: i.project?.code ?? null,
      projectName: i.project?.name ?? null,
      tenderNo: i.tender.tenderNo,
      reference: i.instrumentNo ?? null,
      amount: i.amount.toFixed(2),
      issueDate,
      expiryDate: iso(i.expiryDate),
      status,
      daysLocked: daysLocked(issueDate, open ? today : closedOn(i)),
      daysToExpiry: dte,
      alert: open ? expiryAlert(dte, thresholds) : null,
      version: i.version,
      canAct: open,
    });
  }

  const byProject = new Map<string, typeof retention>();
  for (const r of retention) byProject.set(r.projectId, [...(byProject.get(r.projectId) ?? []), r]);
  for (const [projectId, entries] of byProject) {
    const held = retentionBalance(entries.map((e) => ({ type: e.type, amount: e.amount.toFixed(2) })));
    if (toPaise(held) === BigInt(0)) continue;
    const p = entries[0].project;
    const issueDate = iso(entries.find((e) => e.type === "WITHHELD")?.date);
    rows.push({
      id: `ret:${projectId}`,
      kind: "RETENTION",
      clientId: p.organisationId,
      clientName: p.organisation.name,
      projectId,
      projectCode: p.code,
      projectName: p.name,
      tenderNo: null,
      reference: null,
      amount: held,
      issueDate,
      expiryDate: null,
      status: "LOCKED",
      daysLocked: daysLocked(issueDate, today),
      daysToExpiry: null,
      alert: null,
      version: null,
      canAct: false,
    });
  }
  return { today, thresholds, rows };
}

/**
 * Totals per client and a 12-month locked-balance series (sparkline) for the dashboard tile.
 * Server-only; the caller is responsible for the money_locked:VIEW check.
 */
export async function getMoneyLockedSummary(preloaded?: Ledger): Promise<MoneyLockedSummary> {
  const today = preloaded?.today ?? todayIst();
  const [ledger, instruments, retention] = await Promise.all([
    preloaded ?? loadLedger(today),
    loadInstruments(),
    prisma.retentionEntry.findMany({ where: { deletedAt: null, side: "CLIENT" }, select: { type: true, amount: true, date: true } }),
  ]);
  const open = ledger.rows.filter((r) => isOpenStatus(r.status));
  const periods: LockedPeriod[] = [];
  for (const i of instruments) {
    const from = iso(i.issueDate);
    if (!countsAsLocked(i.status, from)) continue;
    const status = deriveLockedStatus(i.status, i.events.at(-1)?.type ?? null);
    periods.push({ amount: i.amount.toFixed(2), from, to: isOpenStatus(status) ? null : closedOn(i) });
  }
  for (const r of retention) {
    const amt = r.amount.toFixed(2);
    periods.push({ amount: r.type === "WITHHELD" ? amt : fromPaise(-toPaise(amt)), from: iso(r.date), to: null });
  }
  return {
    asOf: today,
    total: open.reduce((s, r) => addMoney(s, r.amount), "0.00"),
    count: open.length,
    expiringCount: open.filter((r) => r.alert).length,
    perClient: totalsByClient(ledger.rows),
    series: lockedSeries(periods, lastMonths(today.slice(0, 7), 12)),
  };
}

// ---------------------------------------------------------------------------
// Server actions (runAction: Zod -> assertCan -> transaction -> audit)
// ---------------------------------------------------------------------------

async function loadForUpdate(tx: Tx, id: string) {
  const i = await tx.securityInstrument.findFirst({
    where: { id, deletedAt: null },
    include: { events: { where: { deletedAt: null }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] } },
  });
  if (!i) throw new ServiceError("NOT_FOUND", "This instrument does not exist.");
  return { i, derived: deriveLockedStatus(i.status, i.events.at(-1)?.type ?? null) };
}

const asDate = (isoDay: IsoDate) => new Date(`${isoDay}T00:00:00.000Z`);

export function buildMoneyLockedActions(getUser?: UserResolver) {
  const opts = { schema: instrumentActionSchema, module: "money_locked", action: "EDIT" as const, reasonRequired: true, getUser };

  const requestRefund = runAction(opts, async ({ tx, input, audit }) => {
    const { i, derived } = await loadForUpdate(tx, input.instrumentId);
    if (derived !== "LOCKED") throw new ServiceError("CONFLICT", "A refund can only be requested while the money is locked.");
    const date = input.date ?? todayIst();
    await tx.securityInstrumentEvent.create({
      data: { securityInstrumentId: i.id, type: "REFUND_REQUESTED", amount: i.amount, date: asDate(date), reference: input.reference || null },
    });
    // The instrument status has no "refund requested" value: the latest event carries it. Bump the version for optimistic locking.
    await updateWithVersion(tx.securityInstrument, i.id, input.version, {});
    await audit({
      action: "money_locked.refund_request",
      entityType: "SecurityInstrument",
      entityId: i.id,
      projectId: i.projectId,
      before: { status: i.status, ledgerStatus: derived },
      after: { status: i.status, ledgerStatus: "REFUND_REQUESTED", date },
      summary: `Refund requested for ${i.type} ${i.instrumentNo ?? i.id}`,
      reasonRequired: true,
    });
    return { id: i.id, status: "REFUND_REQUESTED" as const };
  });

  const markReleased = runAction(opts, async ({ tx, input, audit }) => {
    const { i, derived } = await loadForUpdate(tx, input.instrumentId);
    if (!isOpenStatus(derived)) throw new ServiceError("CONFLICT", "This instrument is already closed.");
    const date = input.date ?? todayIst();
    const isEmd = i.type === "EMD";
    const newStatus = isEmd ? "REFUNDED" : "RELEASED";
    await tx.securityInstrumentEvent.create({
      data: { securityInstrumentId: i.id, type: newStatus, amount: i.amount, date: asDate(date), reference: input.reference || null },
    });
    await updateWithVersion(tx.securityInstrument, i.id, input.version, { status: newStatus });
    await audit({
      action: "money_locked.release",
      entityType: "SecurityInstrument",
      entityId: i.id,
      projectId: i.projectId,
      before: { status: i.status, ledgerStatus: derived },
      after: { status: newStatus, ledgerStatus: "RELEASED", date },
      summary: `${i.type} ${i.instrumentNo ?? i.id} released`,
      reasonRequired: true,
    });
    return { id: i.id, status: "RELEASED" as const };
  });

  return { requestRefund, markReleased };
}
