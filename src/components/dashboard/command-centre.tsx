"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, CalendarClock, CheckSquare, ChevronRight, ReceiptText, Wallet, type LucideIcon } from "lucide-react";
import { DeadlineBadge } from "@/components/shared/status-badge";
import { entityHref, type Dashboard, type RegionFilter } from "@/lib/data";
import { addDays, dayOfWeek, getToday, relativeDeadline, toIstDate } from "@/lib/dates";
import { formatINR, moneyToNumber } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useCurrentPersona } from "@/store/hooks";
import { useAsOfDb } from "@/components/layout/use-as-of-db";
import { ATTENTION_HREF, getAttention } from "./attention-data";

type Kind = "tenders" | "approvals" | "money" | "people";

interface Item {
  id: string;
  kind: Kind;
  icon: LucideIcon;
  title: string;
  meta: string;
  href: string;
  /** 0 = act now, 1 = this week, 2 = keep an eye on it. */
  urgency: 0 | 1 | 2;
  /** Tie-break inside an urgency band; smaller comes first. */
  order: number;
  badge?: ReactNode;
}

const KIND_LABEL: Record<Kind, string> = { tenders: "Bids", approvals: "Approvals", money: "Money", people: "People" };
const RAIL: Record<Item["urgency"], string> = { 0: "bg-status-danger", 1: "bg-status-warning", 2: "bg-status-neutral" };
const DAY = ["S", "M", "T", "W", "T", "F", "S"];
const cr = (v: Parameters<typeof formatINR>[0]) => formatINR(v, { compact: "auto" });
const LINK = "font-semibold underline decoration-accent decoration-2 underline-offset-4";

function useQueue(region: RegionFilter) {
  const db = useAsOfDb();
  const userId = useCurrentPersona().user.id;
  return useMemo(() => {
    const items: Item[] = [];
    const { deadlines, approvals, overdue, salary } = getAttention(db, userId, region);
    deadlines?.rows.forEach((r) => {
      const d = relativeDeadline(r.tender.submissionDeadlineAt);
      items.push({
        id: `t-${r.tender.id}`, kind: "tenders", icon: CalendarClock, title: r.tender.title, meta: `Bid closes · ${r.organisationName} · ${r.stage.name}`,
        href: entityHref("TENDER", r.tender.id), urgency: d.days <= 2 ? 0 : 1, order: d.days, badge: <DeadlineBadge value={r.tender.submissionDeadlineAt} />,
      });
    });
    approvals?.forEach((a) => {
      const d = a.dueAt ? relativeDeadline(a.dueAt).days : 5;
      items.push({
        id: `a-${a.request.id}`, kind: "approvals", icon: CheckSquare, title: a.request.title, meta: `Needs your decision · ${a.typeLabel} · ${a.requestedBy}`,
        href: ATTENTION_HREF.approvals, urgency: d <= 2 ? 0 : 1, order: d, badge: a.dueAt ? <DeadlineBadge value={a.dueAt} /> : undefined,
      });
    });
    overdue?.forEach((r) => {
      items.push({
        id: `r-${r.invoice.id}`, kind: "money", icon: ReceiptText, title: `Chase ${r.organisationName}`, meta: `${cr(r.outstanding)} · ${r.invoice.invoiceNo} · ${r.projectName}`,
        href: entityHref("INVOICE", r.invoice.id), urgency: r.daysOverdue > 30 ? 0 : 1, order: -r.daysOverdue,
        badge: <span className="tabular rounded-md bg-status-danger-tint px-2 py-0.5 text-xs font-medium whitespace-nowrap text-status-danger">{r.daysOverdue} d late</span>,
      });
    });
    if (salary?.employeesPending) {
      items.push({ id: "s-pending", kind: "people", icon: Wallet, title: `Pay ${salary.employeesPending} employees`, meta: `${cr(salary.pendingAmount)} salary not yet paid`, href: ATTENTION_HREF.salaryPending, urgency: 1, order: 10 });
    }
    if (salary?.employeesOnHold) {
      items.push({ id: "s-hold", kind: "people", icon: Wallet, title: `${salary.employeesOnHold} salaries on hold`, meta: `${cr(salary.onHoldAmount)} held · review and release`, href: ATTENTION_HREF.salaryOnHold, urgency: 2, order: 10 });
    }
    items.sort((a, b) => a.urgency - b.urgency || a.order - b.order);
    return { items, deadlines: deadlines ?? { rows: [], count: 0, urgent: 0, withMissingDocuments: 0, withinDays: 7 } };
  }, [db, region, userId]);
}

/** A ring gauge: one percentage, accent fill on a border-coloured track. */
function Ring({ pct, label, caption, href }: { pct: number | null; label: string; caption: string; href: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const v = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent-subtle" aria-label={`${label}: ${pct === null ? "no data" : `${Math.round(v)} percent`}. ${caption}`}>
      <svg viewBox="0 0 64 64" className="size-14 shrink-0 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <span className="min-w-0">
        <span className="tabular block text-xl leading-none font-semibold">{pct === null ? "—" : `${Math.round(v)}%`}</span>
        <span className="mt-1 block text-xs font-medium">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{caption}</span>
      </span>
    </Link>
  );
}

const pctOf = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);

function Briefing({ dashboard, queue }: { dashboard: Dashboard; queue: ReturnType<typeof useQueue> }) {
  const persona = useCurrentPersona();
  // First real name: skip titles ("Dr.") and initials ("A.").
  const first = persona.user.name.split(/\s+/).find((p) => !/^(dr|mr|mrs|ms|prof)\.?$/i.test(p) && p.replace(/\./g, "").length > 1) ?? persona.user.name;
  const { items } = queue;
  const count = (k: Kind) => items.filter((i) => i.kind === k).length;
  const urgent = items.filter((i) => i.urgency === 0).length;
  const recv = dashboard.receivables;
  const total = moneyToNumber(recv.total);
  const overdue = moneyToNumber(recv.overdue);
  const gst = dashboard.gst;
  const health = dashboard.activeProjects;

  const bits: ReactNode[] = [];
  if (count("tenders")) bits.push(<Link key="t" href={ATTENTION_HREF.deadlines} className={LINK}>{count("tenders")} bid{count("tenders") === 1 ? "" : "s"} close this week</Link>);
  if (count("approvals")) bits.push(<Link key="a" href={ATTENTION_HREF.approvals} className={LINK}>{count("approvals")} approval{count("approvals") === 1 ? " is" : "s are"} waiting for you</Link>);
  if (overdue > 0) bits.push(<Link key="r" href={ATTENTION_HREF.receivables} className={LINK}>{cr(overdue)} is overdue from customers</Link>);

  return (
    <section aria-label="Today's briefing" className="rounded-lg border bg-surface">
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Today&apos;s briefing</p>
          <h2 className="mt-1 text-xl font-semibold">Hello, {first}.</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {bits.length === 0 ? (
              "Nothing is urgent right now. Business is running on schedule."
            ) : (
              <>
                {bits.map((b, i) => (
                  <span key={i}>
                    {i > 0 && (i === bits.length - 1 ? " and " : ", ")}
                    {b}
                  </span>
                ))}
                .{urgent > 0 && <span className="font-medium text-status-danger"> {urgent} need action today.</span>}
              </>
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <Ring pct={dashboard.wonLost.winRate} label="Win rate" caption={`${dashboard.wonLost.won} won · ${dashboard.wonLost.lost} lost`} href="/tenders?result=decided" />
          <Ring pct={pctOf(health.byHealth.GREEN, health.count)} label="Projects on track" caption={`${health.byHealth.RED} delayed · ${health.byHealth.AMBER} at risk`} href="/projects" />
          <Ring pct={pctOf(total - overdue, total)} label="Collections healthy" caption={`${recv.overdueCount} overdue invoices`} href="/finance?view=receivables" />
          <Ring pct={pctOf(gst.filed, gst.filed + gst.pending)} label="GST filed" caption={`${gst.pending} due · ${gst.overdue} overdue`} href="/finance?view=gst" />
        </div>
      </div>
    </section>
  );
}

function DoNext({ items }: { items: Item[] }) {
  const [kind, setKind] = useState<Kind | "all">("all");
  const [all, setAll] = useState(false);
  const kinds = (Object.keys(KIND_LABEL) as Kind[]).filter((k) => items.some((i) => i.kind === k));
  const filtered = items.filter((i) => kind === "all" || i.kind === kind);
  const shown = all ? filtered : filtered.slice(0, 6);

  return (
    <section aria-label="Do next" className="min-w-0 rounded-lg border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Do next</h2>
          <p className="text-xs text-muted-foreground">Most urgent first, across bids, approvals, money and people.</p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
          {(["all", ...kinds] as const).map((k) => {
            const n = k === "all" ? items.length : items.filter((i) => i.kind === k).length;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k);
                  setAll(false);
                }}
                className={cn("min-h-8 rounded-full border px-3 text-xs font-medium", kind === k ? "border-accent-strong bg-accent text-accent-foreground" : "hover:bg-accent-subtle")}
              >
                {k === "all" ? "All" : KIND_LABEL[k]} <span className="tabular opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">You are all caught up.</p>
      ) : (
        <ol>
          {shown.map((i, idx) => (
            <li key={i.id} className="border-b last:border-b-0">
              <Link href={i.href} className="group relative flex min-h-16 items-center gap-3 py-3 pr-3 pl-4 hover:bg-accent-subtle">
                <span className={cn("absolute inset-y-2 left-0 w-1 rounded-r-full", RAIL[i.urgency])} aria-hidden="true" />
                <span className="tabular w-5 shrink-0 text-xs text-muted-foreground">{idx + 1}</span>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle">
                  <i.icon className="size-4 text-accent-strong" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-sm leading-snug font-medium">{i.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{i.meta}</span>
                </span>
                {i.badge}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-accent-strong" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      )}
      {filtered.length > 6 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="flex min-h-11 w-full items-center justify-center border-t text-sm font-medium text-accent-strong hover:bg-accent-subtle">
          {all ? "Show fewer" : `Show all ${filtered.length}`}
        </button>
      )}
    </section>
  );
}

/** Next seven days as a strip: each day shows how many bids close. */
function WeekStrip({ deadlines }: { deadlines: ReturnType<typeof useQueue>["deadlines"] }) {
  const today = getToday();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const byDay = new Map<string, string[]>();
  deadlines.rows.forEach((r) => {
    const d = toIstDate(r.tender.submissionDeadlineAt);
    byDay.set(d, [...(byDay.get(d) ?? []), r.tender.title]);
  });
  return (
    <section aria-label="Next seven days" className="rounded-lg border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Next 7 days</h2>
        <Link href="/tenders/deadlines" className="inline-flex items-center gap-1 text-xs font-medium text-accent-strong hover:underline">
          All deadlines <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </div>
      <ul className="mt-3 grid grid-cols-7 gap-1.5">
        {days.map((d, i) => {
          const titles = byDay.get(d) ?? [];
          return (
            <li key={d}>
              <Link
                href="/tenders/deadlines"
                title={titles.length ? titles.join("\n") : "No bids close"}
                aria-label={`${d}: ${titles.length} bid${titles.length === 1 ? "" : "s"} closing`}
                className={cn("flex min-h-16 flex-col items-center justify-between rounded-md border py-2 hover:bg-accent-subtle", i === 0 && "border-accent-strong", titles.length > 0 && "bg-accent-subtle")}
              >
                <span className="text-[11px] text-muted-foreground">{DAY[dayOfWeek(d)]}</span>
                <span className="tabular text-sm font-semibold">{d.slice(8)}</span>
                <span className="flex h-2 gap-0.5" aria-hidden="true">
                  {titles.slice(0, 3).map((_, k) => (
                    <span key={k} className="size-2 rounded-full bg-accent ring-1 ring-accent-strong" />
                  ))}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        {deadlines.count ? `${deadlines.count} bids close · ${deadlines.urgent} within 2 days · ${deadlines.withMissingDocuments} with documents missing` : "No bids close in the next 7 days."}
      </p>
    </section>
  );
}

/** Director home, top half: a written briefing, four health rings, one ranked queue and the week ahead. */
export function CommandCentre({ dashboard, region }: { dashboard: Dashboard; region: RegionFilter }) {
  const queue = useQueue(region);
  return (
    <>
      <Briefing dashboard={dashboard} queue={queue} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <DoNext items={queue.items} />
        <WeekStrip deadlines={queue.deadlines} />
      </div>
    </>
  );
}
