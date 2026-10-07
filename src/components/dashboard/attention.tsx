"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, CheckSquare, ReceiptText, Wallet, type LucideIcon } from "lucide-react";
import { DeadlineBadge } from "@/components/shared/status-badge";
import { canView, entityHref, getPendingApprovalsFor, getSalaryPending, getUpcomingTenderDeadlines, listReceivables, type RegionFilter } from "@/lib/data";
import { inRegion } from "@/lib/data/shared";
import { formatMonth } from "@/lib/dates";
import { formatINR, moneyToNumber } from "@/lib/money";
import { useCurrentPersona, useDb } from "@/store/hooks";

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
    <div className="flex min-w-0 flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-accent-strong" aria-hidden="true" />
          <h3 className="truncate text-sm font-semibold">{title}</h3>
        </div>
        <span className="tabular rounded-md bg-accent-subtle px-2 py-0.5 text-xs font-semibold text-accent-strong">{count}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{summary}</p>
      <ul className="mt-3 flex-1 space-y-1">
        {rows.length === 0 && <li className="py-2 text-sm text-muted-foreground">{emptyText}</li>}
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={r.href} className="flex min-h-11 items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent-subtle md:min-h-0">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{r.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{r.meta}</span>
              </span>
              {r.badge}
            </Link>
          </li>
        ))}
      </ul>
      <Link href={href} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent-strong hover:underline md:min-h-0">
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
  const db = useDb();
  const persona = useCurrentPersona();
  const userId = persona.user.id;

  const data = useMemo(() => {
    const deadlines = getUpcomingTenderDeadlines(db, region, 7);
    const approvals = getPendingApprovalsFor(db, userId).filter((a) => inRegion(region, a.request.regionId));
    const overdue = listReceivables(db, region)
      .filter((r) => r.daysOverdue > 0)
      .sort((a, b) => moneyToNumber(b.outstanding) - moneyToNumber(a.outstanding));
    const salary = getSalaryPending(db, region);
    return { deadlines, approvals, overdue, salary };
  }, [db, region, userId]);

  const show = (k: Part) => !only || only.includes(k);
  const blocks: ReactNode[] = [];

  if (show("deadlines") && canView(db, userId, "tenders")) {
    blocks.push(
      <Block
        key="d"
        icon={CalendarClock}
        title="Deadlines this week"
        count={String(data.deadlines.count)}
        summary={data.deadlines.count ? `${data.deadlines.urgent} due within 2 days · ${data.deadlines.withMissingDocuments} with documents missing` : "No bid deadlines in the next 7 days"}
        rows={data.deadlines.rows.slice(0, 3).map((r) => ({ id: r.tender.id, title: r.tender.title, meta: `${r.organisationName} · ${r.stage.name}`, href: entityHref("TENDER", r.tender.id), badge: <DeadlineBadge value={r.tender.submissionDeadlineAt} /> }))}
        href="/tenders?view=deadlines"
        actionLabel="All upcoming deadlines"
        emptyText="Nothing due this week."
      />,
    );
  }
  if (show("approvals") && canView(db, userId, "approvals")) {
    blocks.push(
      <Block
        key="a"
        icon={CheckSquare}
        title="Pending approvals"
        count={String(data.approvals.length)}
        summary={data.approvals.length ? "Waiting for your decision" : "Nothing is waiting on you"}
        rows={data.approvals.slice(0, 3).map((a) => ({ id: a.request.id, title: a.request.title, meta: `${a.typeLabel} · ${a.requestedBy}`, href: "/approvals", badge: a.dueAt ? <DeadlineBadge value={a.dueAt} /> : undefined }))}
        href="/approvals"
        actionLabel="Open approvals inbox"
        emptyText="You are all caught up."
      />,
    );
  }
  if (show("receivables") && canView(db, userId, "finance")) {
    const total = data.overdue.reduce((a, r) => a + moneyToNumber(r.outstanding), 0);
    blocks.push(
      <Block
        key="r"
        icon={ReceiptText}
        title="Overdue receivables"
        count={String(data.overdue.length)}
        summary={data.overdue.length ? `${formatINR(total, { compact: "auto" })} overdue from customers` : "No customer payment is overdue"}
        rows={data.overdue.slice(0, 3).map((r) => ({ id: r.invoice.id, title: `${r.organisationName} · ${r.invoice.invoiceNo}`, meta: `${formatINR(r.outstanding, { compact: "auto" })} · ${r.projectName}`, href: entityHref("INVOICE", r.invoice.id), badge: <OverdueDays days={r.daysOverdue} /> }))}
        href="/finance?view=receivables&overdue=1"
        actionLabel="Follow up on receivables"
        emptyText="Collections are on time."
      />,
    );
  }
  if (show("salary") && canView(db, userId, "employees")) {
    const s = data.salary;
    const rows: Row[] = [];
    if (s.employeesPending) rows.push({ id: "p", title: `${s.employeesPending} employees awaiting salary`, meta: formatINR(s.pendingAmount, { compact: "auto" }), href: "/employees?salary=pending" });
    if (s.employeesOnHold) rows.push({ id: "h", title: `${s.employeesOnHold} employees on hold`, meta: formatINR(s.onHoldAmount, { compact: "auto" }), href: "/employees?salary=on-hold" });
    s.runs.filter((r) => r.status !== "PAID" && r.status !== "LOCKED").slice(0, 2).forEach((r) => rows.push({ id: r.region, title: `${r.region} payroll run`, meta: "Not yet paid", href: "/employees?tab=payroll" }));
    blocks.push(
      <Block
        key="s"
        icon={Wallet}
        title="Salary pending"
        count={String(s.employeesPending)}
        summary={s.period ? `${formatMonth(s.period)} payroll · ${formatINR(s.pendingAmount, { compact: "auto" })} not yet paid` : "No payroll run yet"}
        rows={rows.slice(0, 3)}
        href="/employees?salary=pending"
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
      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4 [&>*]:bg-surface">{blocks}</div>
    </section>
  );
}
