"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, CheckSquare, ReceiptText, Wallet, type LucideIcon } from "lucide-react";
import { DeadlineBadge } from "@/components/shared/status-badge";
import { entityHref, type RegionFilter } from "@/lib/data";
import { formatMonth } from "@/lib/dates";
import { formatINR, moneyToNumber } from "@/lib/money";
import { useCurrentPersona } from "@/store/hooks";
import { useAsOfDb } from "@/components/layout/use-as-of-db";
import { ATTENTION_HREF, getAttention } from "./attention-data";

interface Row {
  id: string;
  title: string;
  meta: string;
  href: string;
  badge?: ReactNode;
}

interface BlockProps {
  icon: LucideIcon;
  title: string;
  count: string;
  summary: string;
  rows: Row[];
  href: string;
  actionLabel: string;
  emptyText: string;
}

function Block({ icon: Icon, title, count, summary, rows, href, actionLabel, emptyText }: BlockProps) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-subtle">
              <Icon className="size-4 text-accent-strong" aria-hidden="true" />
            </span>
            <h3 className="truncate text-sm font-semibold">{title}</h3>
          </div>
          <span className="tabular rounded-full bg-accent-subtle px-2.5 py-0.5 text-xs font-semibold text-accent-strong">{count}</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{summary}</p>
      </div>
      <ul className="flex-1 divide-y border-t">
        {rows.length === 0 && <li className="px-4 py-4 text-sm text-muted-foreground">{emptyText}</li>}
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={r.href} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 hover:bg-accent-subtle">
              <span className="min-w-0">
                <span className="line-clamp-2 block text-sm leading-snug font-medium">{r.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{r.meta}</span>
              </span>
              {r.badge}
            </Link>
          </li>
        ))}
      </ul>
      <Link href={href} className="flex min-h-11 items-center justify-between border-t px-4 text-sm font-medium text-accent-strong hover:bg-accent-subtle">
        {actionLabel}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function OverdueDays({ days }: { days: number }) {
  return (
    <span className="tabular inline-flex shrink-0 items-center gap-1 rounded-md bg-status-danger-tint px-2 py-0.5 text-xs font-medium whitespace-nowrap text-status-danger">
      <AlertTriangle className="size-3" aria-hidden="true" />
      {days} d overdue
    </span>
  );
}

type Part = "deadlines" | "approvals" | "receivables" | "salary";

/** "Needs attention": deadlines this week, pending approvals, overdue receivables, salary pending. */
export function AttentionArea({ region, only }: { region: RegionFilter; only?: Part[] }) {
  const db = useAsOfDb();
  const persona = useCurrentPersona();
  const userId = persona.user.id;

  const data = useMemo(() => getAttention(db, userId, region), [db, region, userId]);

  const show = (k: Part) => !only || only.includes(k);
  const blocks: ReactNode[] = [];

  if (show("deadlines") && data.deadlines) {
    const deadlines = data.deadlines;
    blocks.push(
      <Block
        key="d"
        icon={CalendarClock}
        title="Deadlines this week"
        count={String(deadlines.count)}
        summary={deadlines.count ? `${deadlines.urgent} due within 2 days · ${deadlines.withMissingDocuments} with documents missing` : "No bid deadlines in the next 7 days"}
        rows={deadlines.rows.slice(0, 3).map((r) => ({ id: r.tender.id, title: r.tender.title, meta: `${r.organisationName} · ${r.stage.name}`, href: entityHref("TENDER", r.tender.id), badge: <DeadlineBadge value={r.tender.submissionDeadlineAt} /> }))}
        href={ATTENTION_HREF.deadlines}
        actionLabel="All upcoming deadlines"
        emptyText="Nothing due this week."
      />,
    );
  }
  if (show("approvals") && data.approvals) {
    const approvals = data.approvals;
    blocks.push(
      <Block
        key="a"
        icon={CheckSquare}
        title="Pending approvals"
        count={String(approvals.length)}
        summary={approvals.length ? "Waiting for your decision" : "Nothing is waiting on you"}
        rows={approvals.slice(0, 3).map((a) => ({ id: a.request.id, title: a.request.title, meta: `${a.typeLabel} · ${a.requestedBy}`, href: ATTENTION_HREF.approvals, badge: a.dueAt ? <DeadlineBadge value={a.dueAt} /> : undefined }))}
        href={ATTENTION_HREF.approvals}
        actionLabel="Open approvals inbox"
        emptyText="You are all caught up."
      />,
    );
  }
  if (show("receivables") && data.overdue) {
    const overdue = data.overdue;
    const total = overdue.reduce((a, r) => a + moneyToNumber(r.outstanding), 0);
    blocks.push(
      <Block
        key="r"
        icon={ReceiptText}
        title="Overdue receivables"
        count={String(overdue.length)}
        summary={overdue.length ? `${formatINR(total, { compact: "auto" })} overdue from customers` : "No customer payment is overdue"}
        rows={overdue.slice(0, 3).map((r) => ({ id: r.invoice.id, title: `${r.organisationName} · ${r.invoice.invoiceNo}`, meta: `${formatINR(r.outstanding, { compact: "auto" })} · ${r.projectName}`, href: entityHref("INVOICE", r.invoice.id), badge: <OverdueDays days={r.daysOverdue} /> }))}
        href={ATTENTION_HREF.receivables}
        actionLabel="Follow up on receivables"
        emptyText="Collections are on time."
      />,
    );
  }
  if (show("salary") && data.salary) {
    const s = data.salary;
    const rows: Row[] = [];
    if (s.employeesPending) rows.push({ id: "p", title: `${s.employeesPending} employees awaiting salary`, meta: formatINR(s.pendingAmount, { compact: "auto" }), href: ATTENTION_HREF.salaryPending });
    if (s.employeesOnHold) rows.push({ id: "h", title: `${s.employeesOnHold} employees on hold`, meta: formatINR(s.onHoldAmount, { compact: "auto" }), href: ATTENTION_HREF.salaryOnHold });
    s.runs.filter((r) => r.status !== "PAID" && r.status !== "LOCKED").slice(0, 2).forEach((r) => rows.push({ id: r.region, title: `${r.region} payroll run`, meta: "Not yet paid", href: ATTENTION_HREF.payroll }));
    blocks.push(
      <Block
        key="s"
        icon={Wallet}
        title="Salary pending"
        count={String(s.employeesPending)}
        summary={s.period ? `${formatMonth(s.period)} payroll · ${formatINR(s.pendingAmount, { compact: "auto" })} not yet paid` : "No payroll run yet"}
        rows={rows.slice(0, 3)}
        href={ATTENTION_HREF.salaryPending}
        actionLabel="Review pending salaries"
        emptyText="All salaries are paid."
      />,
    );
  }

  if (!blocks.length) return null;
  return (
    <section aria-label="Needs attention" className="rounded-lg border bg-surface">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Needs attention</h2>
        <p className="text-xs text-muted-foreground">What is due, waiting or overdue right now, with a direct way to act.</p>
      </div>
      <div className="grid gap-px bg-border lg:grid-cols-2 2xl:grid-cols-4 [&>*]:bg-surface">{blocks}</div>
    </section>
  );
}
