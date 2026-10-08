"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { ChartTooltipContent } from "@/components/charts/chart-tooltip";
import { DeadlineTimeline, type TimelineItem } from "@/components/charts/deadline-timeline";
import { DonutChart } from "@/components/charts/donut-chart";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { HeatStrip } from "@/components/charts/heat-strip";
import { MoneyLockedTiles, type MoneyLockedItem } from "@/components/charts/money-locked-tiles";
import { ProgressRing } from "@/components/charts/progress-ring";
import { RadialGauge } from "@/components/charts/radial-gauge";
import { StackedBar } from "@/components/charts/stacked-bar";
import { TreemapChart } from "@/components/charts/treemap-chart";
import { ageingSegments, buildFunnel, overdueShare, treemapItems, type HeatCell } from "@/components/charts/transforms";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { Dashboard } from "@/lib/data";
import { entityHref } from "@/lib/data";
import { formatMonth } from "@/lib/dates";
import { formatINR, formatINRAxis, moneyToNumber } from "@/lib/money";
import { useIsNarrow } from "./use-narrow";

const TICK = { fill: "var(--text-secondary)", fontSize: 11 };
const inr = (v: unknown) => formatINR(Number(v), { compact: true });
const inrAuto = (v: number) => formatINR(v, { compact: "auto" });
const shortMonth = (m: string) => formatMonth(m).split(" ")[0];

function ViewAll({ href, label = "View list" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-medium text-accent-strong hover:underline md:min-h-0">
      {label}
      <ArrowRight className="size-3" aria-hidden="true" />
    </Link>
  );
}

/** Pairs a series name with its INR value inside the shared tooltip. */
const namedInr = (v: unknown, name: unknown) => (
  <span className="flex w-full items-center justify-between gap-4">
    <span className="text-muted-foreground">{String(name)}</span>
    <span className="tabular font-medium">{inr(v)}</span>
  </span>
);

const AUTO_H = "h-auto min-h-48";

// ---- Tender pipeline funnel ------------------------------------------------------------------
export function TenderFunnelChart({ data, wonLabel = "Won", wonCount, wonValue }: { data: Dashboard["activeTenders"]; wonLabel?: string; wonCount: number; wonValue: number }) {
  const stages = buildFunnel(data.byStage, { label: wonLabel, count: wonCount, value: wonValue });
  return (
    <ChartCard
      title="Tender pipeline"
      unit="Tenders that reached each stage or beyond · value in ₹ · % moving on to the next step"
      action={<ViewAll href="/tenders?status=open" />}
      isEmpty={stages.every((s) => s.reachedCount === 0)}
      heightClassName={AUTO_H}
    >
      <FunnelChart stages={stages} hrefFor={(s) => (s.isWon ? "/tenders?result=decided" : `/tenders?stage=${encodeURIComponent(s.stageId)}`)} />
    </ChartCard>
  );
}

// ---- Win rate: gauge + donut -----------------------------------------------------------------
export function WinRateChart({ data, cancelled }: { data: Dashboard["wonLost"]; cancelled: { count: number; value: number; valueInLostStage: number } }) {
  const won = moneyToNumber(data.wonValue);
  // Cancelled tenders parked in the Lost stage are counted in lostValue; take them out so the slices do not overlap.
  const lost = Math.max(0, moneyToNumber(data.lostValue) - cancelled.valueInLostStage);
  const total = won + lost + cancelled.value;
  return (
    <ChartCard
      title="Win rate"
      unit={`${data.won} won · ${data.lost} lost${cancelled.count ? ` · ${cancelled.count} cancelled` : ""} · donut shows value in ₹`}
      action={<ViewAll href="/tenders?result=decided" />}
      isEmpty={data.winRate === null && total === 0}
      heightClassName={AUTO_H}
    >
      <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
        <RadialGauge pct={data.winRate} label="Win rate" caption={`${data.won} won of ${data.won + data.lost} decided`} href="/tenders?result=decided" />
        <div className="h-64">
          <DonutChart
            testId="chart-winrate-donut"
            format={inrAuto}
            centre={<span className="tabular text-sm font-semibold">{inrAuto(total)}</span>}
            slices={[
              { key: "won", label: "Won", value: won, color: "var(--status-success)", href: "/tenders?result=won" },
              { key: "lost", label: "Lost", value: lost, color: "var(--chart-5)", href: "/tenders?result=lost" },
              { key: "cancelled", label: "Cancelled", value: cancelled.value, color: "var(--chart-3)", href: "/tenders?result=cancelled" },
            ]}
          />
        </div>
      </div>
    </ChartCard>
  );
}

// ---- Project health: donut + progress rings --------------------------------------------------
export function ProjectHealthChart({ data }: { data: Dashboard["activeProjects"] }) {
  const h = data.byHealth;
  const order = { RED: 0, AMBER: 1, GREEN: 2 } as const;
  const rows = [...data.rows].sort((a, b) => order[a.health] - order[b.health] || a.gapPct - b.gapPct).slice(0, 12);
  return (
    <ChartCard
      title="Project health"
      unit={`${data.count} active projects · ring = actual progress, tick = planned`}
      action={<ViewAll href="/projects?status=RUNNING" />}
      isEmpty={data.count === 0}
      heightClassName={AUTO_H}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="h-60">
          <DonutChart
            testId="chart-health-donut"
            format={(n) => String(n)}
            centre={
              <>
                <span className="tabular text-xl leading-none font-semibold">{data.count}</span>
                <span className="text-[11px] text-muted-foreground">projects</span>
              </>
            }
            slices={[
              { key: "green", label: "On track", value: h.GREEN, color: "var(--status-success)", href: "/projects?status=GREEN" },
              { key: "amber", label: "At risk", value: h.AMBER, color: "var(--status-warning)", href: "/projects?status=AMBER" },
              { key: "red", label: "Delayed", value: h.RED, color: "var(--status-danger)", href: "/projects?status=RED" },
            ]}
          />
        </div>
        <ul className="grid grid-cols-1 gap-1 min-[420px]:grid-cols-2 xl:grid-cols-3" data-testid="chart-progress-rings">
          {rows.map((r) => (
            <li key={r.project.id}>
              <ProgressRing name={r.project.name} actual={r.progressPct} planned={r.plannedPct} health={r.health} href={entityHref("PROJECT", r.project.id)} />
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}

// ---- Project value by service line: treemap --------------------------------------------------
export function ServiceLineValueChart({ data }: { data: Dashboard["projectValue"] }) {
  const items = treemapItems(data.byServiceLine.map((s) => ({ name: s.serviceLine, value: s.value }))).map((i) => ({ ...i, href: "/projects?status=RUNNING" }));
  return (
    <ChartCard title="Project value by service line" unit="Contract value of active projects, ₹ · tile size = value" action={<ViewAll href="/projects?status=RUNNING" />} isEmpty={items.length === 0}>
      <TreemapChart data={items} />
    </ChartCard>
  );
}

// ---- Upcoming deadlines: timeline + 30-day heat strip ----------------------------------------
export function DeadlinesChart({ items, heat, total }: { items: TimelineItem[]; heat: HeatCell[]; total: number }) {
  return (
    <ChartCard
      title="Upcoming deadlines"
      unit={`${total} bid${total === 1 ? "" : "s"} closing in the next 30 days · number in a day = bids closing`}
      action={<ViewAll href="/tenders/deadlines" label="All deadlines" />}
      isEmpty={total === 0}
      emptyMessage="No bids close in the next 30 days."
      heightClassName={AUTO_H}
    >
      <div className="space-y-4">
        <HeatStrip cells={heat} href="/tenders/deadlines" />
        <DeadlineTimeline items={items.slice(0, 6)} />
        {items.length > 6 && <p className="text-xs text-muted-foreground">+ {items.length - 6} more on the deadlines page.</p>}
      </div>
    </ChartCard>
  );
}

// ---- Receivables ageing: ONE stacked horizontal bar ------------------------------------------
const AGEING_COLOUR = ["var(--chart-5)", "var(--chart-3)", "var(--status-warning)", "var(--status-danger)"];

export function ReceivablesAgeingChart({ data }: { data: Dashboard["receivables"] }) {
  const segments = ageingSegments(data.aging);
  return (
    <ChartCard
      title="Receivables ageing"
      unit={`Outstanding ${formatINR(data.total, { compact: "auto" })} by days past due · ${Math.round(overdueShare(data.aging))}% is older than the first bucket`}
      action={<ViewAll href="/finance?view=receivables" />}
      isEmpty={segments.every((s) => s.amount === 0)}
      heightClassName="h-auto min-h-32"
    >
      <StackedBar segments={segments} colors={AGEING_COLOUR} hrefFor={(s) => `/finance?view=receivables&ageing=${encodeURIComponent(s.key)}`} />
    </ChartCard>
  );
}

// ---- Money locked with clients ---------------------------------------------------------------
export function MoneyLockedSection({ items }: { items?: MoneyLockedItem[] }) {
  return (
    <section aria-label="Money locked with clients" className="min-w-0 rounded-lg border bg-surface p-4">
      <h2 className="text-sm font-semibold">Money locked with clients</h2>
      <p className="mb-3 text-xs text-muted-foreground">Deposits, guarantees and retention held by customers, ₹</p>
      <MoneyLockedTiles items={items} />
    </section>
  );
}

// ---- Monthly trend: revenue vs expenses area -------------------------------------------------
export function RevenueExpensesChart({ data }: { data: Dashboard["revenueExpenses"] }) {
  const narrow = useIsNarrow();
  const router = useRouter();
  const config = { revenue: { label: "Revenue", color: "var(--chart-1)" }, expenses: { label: "Expenses", color: "var(--chart-4)" } } satisfies ChartConfig;
  const rows = data.months.map((m) => ({ ...m, label: shortMonth(m.month) }));
  return (
    <ChartCard
      title="Monthly revenue vs expenses"
      unit={`Last 12 months, ₹ · margin ${data.marginPct.toFixed(1)}% · click to open Finance`}
      action={<ViewAll href="/finance" />}
      isEmpty={rows.every((r) => r.revenue === 0 && r.expenses === 0)}
      legend={
        <>
          <LegendItem color="var(--chart-1)" label="Revenue (invoiced, before GST)" />
          <LegendItem color="var(--chart-4)" label="Expenses (project cost)" />
        </>
      }
    >
      <div data-testid="chart-revenue-trend" className="h-full w-full">
        <ChartContainer config={config} className="aspect-auto h-full w-full">
          <AreaChart data={rows} margin={{ left: 0, right: 8 }} className="cursor-pointer" onClick={() => router.push("/finance")}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval={narrow ? 2 : 0} />
            <YAxis tickFormatter={formatINRAxis} tickLine={false} axisLine={false} tick={TICK} width={52} tickCount={4} />
            <ChartTooltip content={<ChartTooltipContent formatter={namedInr} />} />
            <Area type="monotone" dataKey="expenses" stroke="var(--chart-4)" strokeWidth={2} fill="var(--chart-4)" fillOpacity={0.12} dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="revenue" stroke="var(--accent-strong)" strokeWidth={2} fill="var(--chart-1)" fillOpacity={0.3} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ChartContainer>
      </div>
    </ChartCard>
  );
}

// ---- The one ordinary bar chart --------------------------------------------------------------
export function GstFilingChart({ data }: { data: Dashboard["gst"] }) {
  const narrow = useIsNarrow();
  const config = { filed: { label: "Filed", color: "var(--status-success)" }, pending: { label: "Pending", color: "var(--status-warning)" } } satisfies ChartConfig;
  const rows = data.byMonth.map((m) => ({ ...m, label: shortMonth(m.month) }));
  return (
    <ChartCard
      title="GST filing by invoice month"
      unit="Number of invoices"
      action={<ViewAll href="/finance?view=gst" />}
      isEmpty={rows.every((r) => r.filed + r.pending === 0)}
      legend={
        <>
          <LegendItem color="var(--status-success)" label="Filed" />
          <LegendItem color="var(--status-warning)" label="Pending" />
        </>
      }
    >
      <ChartContainer config={config} className="h-full w-full">
        <BarChart data={rows} margin={{ left: 0, right: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval={narrow ? 1 : 0} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={TICK} width={28} tickCount={4} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="filed" stackId="g" fill="var(--status-success)" />
          <Bar dataKey="pending" stackId="g" fill="var(--status-warning)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
