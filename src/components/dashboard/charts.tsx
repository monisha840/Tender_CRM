"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { Dashboard } from "@/lib/data";
import { formatMonth } from "@/lib/dates";
import { formatINR, formatINRAxis } from "@/lib/money";
import { useIsNarrow } from "./use-narrow";

const TICK = { fill: "var(--text-secondary)", fontSize: 11 };
const OUTLINE = { stroke: "var(--accent-strong)", strokeWidth: 1 };
const inr = (v: unknown) => formatINR(Number(v), { compact: true });
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

export function TenderFunnelChart({ data }: { data: Dashboard["activeTenders"] }) {
  const router = useRouter();
  const rows = data.byStage.map((s) => ({ ...s, label: `${s.stage} (${s.count})` }));
  const config = { value: { label: "Estimated value", color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartCard
      title="Tender pipeline by stage"
      unit="Estimated value, ₹ · number of tenders in brackets · click a bar to open the stage"
      action={<ViewAll href="/tenders?status=open" />}
      isEmpty={rows.every((r) => r.count === 0)}
      legend={<LegendItem color="var(--chart-1)" label="Open tenders" />}
    >
      <ChartContainer config={config} className="h-full w-full">
        <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 12 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" tickFormatter={formatINRAxis} tickLine={false} axisLine={false} tick={TICK} tickCount={4} />
          <YAxis type="category" dataKey="label" width={112} tickLine={false} axisLine={false} tick={TICK} />
          <ChartTooltip content={<ChartTooltipContent formatter={inr} />} />
          <Bar dataKey="value" fill="var(--chart-1)" {...OUTLINE} radius={3} className="cursor-pointer" onClick={(d) => router.push(`/tenders?stage=${encodeURIComponent((d as unknown as { stageId: string }).stageId)}`)} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

export function WonLostChart({ data }: { data: Dashboard["wonLost"] }) {
  const config = { won: { label: "Won", color: "var(--status-success)" }, lost: { label: "Lost", color: "var(--chart-5)" } } satisfies ChartConfig;
  const rows = data.byMonth.map((m) => ({ ...m, label: shortMonth(m.month) }));
  return (
    <ChartCard
      title="Won vs lost tenders"
      unit={`Value by bid month, ₹ · win rate ${data.winRate === null ? "—" : `${Math.round(data.winRate)}%`} (${data.won} won, ${data.lost} lost)`}
      action={<ViewAll href="/tenders?result=decided" />}
      isEmpty={rows.length === 0}
      legend={
        <>
          <LegendItem color="var(--status-success)" label="Won" />
          <LegendItem color="var(--chart-5)" label="Lost" />
        </>
      }
    >
      <ChartContainer config={config} className="h-full w-full">
        <BarChart data={rows} margin={{ left: 0, right: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval="preserveStartEnd" />
          <YAxis tickFormatter={formatINRAxis} tickLine={false} axisLine={false} tick={TICK} width={52} tickCount={4} />
          <ChartTooltip content={<ChartTooltipContent formatter={namedInr} />} />
          <Bar dataKey="won" stackId="a" fill="var(--status-success)" />
          <Bar dataKey="lost" stackId="a" fill="var(--chart-5)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

export function ProjectProgressChart({ data }: { data: Dashboard["activeProjects"] }) {
  const narrow = useIsNarrow();
  const config = { planned: { label: "Planned", color: "var(--chart-4)" }, actual: { label: "Actual", color: "var(--chart-1)" } } satisfies ChartConfig;
  const rows = data.progressHistory.map((p) => ({ ...p, label: shortMonth(p.month), planned: Math.round(p.planned), actual: Math.round(p.actual) }));
  return (
    <ChartCard
      title="Project progress: planned vs actual"
      unit={`% complete, average of ${data.count} active projects`}
      action={<ViewAll href="/projects" />}
      isEmpty={rows.length === 0}
      legend={
        <>
          <LegendItem color="var(--chart-1)" label="Actual" />
          <LegendItem color="var(--chart-4)" label="Planned" />
        </>
      }
    >
      <ChartContainer config={config} className="h-full w-full">
        <LineChart data={rows} margin={{ left: 0, right: 12 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval={narrow ? 2 : 0} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} tick={TICK} width={40} tickCount={5} />
          <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => (
            <span className="flex w-full items-center justify-between gap-4">
              <span className="text-muted-foreground">{String(name)}</span>
              <span className="tabular font-medium">{String(v)}%</span>
            </span>
          )} />} />
          <Line type="monotone" dataKey="planned" stroke="var(--chart-4)" strokeWidth={2} strokeDasharray="4 3" dot={false} />
          <Line type="monotone" dataKey="actual" stroke="var(--accent-strong)" strokeWidth={2.5} dot={{ r: 2.5, fill: "var(--chart-1)", stroke: "var(--accent-strong)" }} />
        </LineChart>
      </ChartContainer>
    </ChartCard>
  );
}

export function RevenueExpensesChart({ data }: { data: Dashboard["revenueExpenses"] }) {
  const narrow = useIsNarrow();
  const config = { revenue: { label: "Revenue", color: "var(--chart-1)" }, expenses: { label: "Expenses", color: "var(--chart-4)" } } satisfies ChartConfig;
  const rows = data.months.map((m) => ({ ...m, label: shortMonth(m.month) }));
  return (
    <ChartCard
      title="Revenue vs expenses"
      unit={`Last 12 months, ₹ · margin ${data.marginPct.toFixed(1)}%`}
      action={<ViewAll href="/finance" />}
      isEmpty={rows.every((r) => r.revenue === 0 && r.expenses === 0)}
      legend={
        <>
          <LegendItem color="var(--chart-1)" label="Revenue (invoiced, before GST)" />
          <LegendItem color="var(--chart-4)" label="Expenses (project cost)" />
        </>
      }
    >
      <ChartContainer config={config} className="h-full w-full">
        <BarChart data={rows} margin={{ left: 0, right: 8 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval={narrow ? 1 : 0} />
          <YAxis tickFormatter={formatINRAxis} tickLine={false} axisLine={false} tick={TICK} width={52} tickCount={4} />
          <ChartTooltip content={<ChartTooltipContent formatter={namedInr} />} />
          <Bar dataKey="revenue" fill="var(--chart-1)" {...OUTLINE} radius={[3, 3, 0, 0]} />
          <Bar dataKey="expenses" fill="var(--chart-4)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

const AGEING_COLOUR = ["var(--chart-5)", "var(--status-warning)", "var(--status-warning)", "var(--status-danger)"];

export function ReceivablesAgeingChart({ data }: { data: Dashboard["receivables"] }) {
  const router = useRouter();
  const config = { amount: { label: "Outstanding", color: "var(--chart-1)" } } satisfies ChartConfig;
  const rows = data.aging.map((a) => ({ ...a, label: `${a.bucket} (${a.count})` }));
  return (
    <ChartCard
      title="Receivables ageing"
      unit="Outstanding by days past due, ₹ · invoices in brackets · click a bar to open it"
      action={<ViewAll href="/finance?view=receivables" />}
      isEmpty={rows.every((r) => r.amount === 0)}
      legend={<LegendItem color="var(--status-danger)" label="Older balances need follow-up first" />}
    >
      <ChartContainer config={config} className="h-full w-full">
        <BarChart data={rows} margin={{ left: 0, right: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={TICK} />
          <YAxis tickFormatter={formatINRAxis} tickLine={false} axisLine={false} tick={TICK} width={52} tickCount={4} />
          <ChartTooltip content={<ChartTooltipContent formatter={inr} />} />
          <Bar dataKey="amount" radius={[3, 3, 0, 0]} className="cursor-pointer" onClick={(d) => router.push(`/finance?view=receivables&ageing=${encodeURIComponent((d as unknown as { bucket: string }).bucket)}`)}>
            {rows.map((r, i) => (
              <Cell key={r.bucket} fill={AGEING_COLOUR[i]} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

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

export function ServiceLineValueChart({ data }: { data: Dashboard["projectValue"] }) {
  const config = { value: { label: "Contract value", color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartCard
      title="Project value by service line"
      unit="Contract value, ₹"
      action={<ViewAll href="/projects" />}
      isEmpty={data.byServiceLine.length === 0}
      legend={<LegendItem color="var(--chart-1)" label="Contract value" />}
    >
      <ChartContainer config={config} className="h-full w-full">
        <BarChart data={data.byServiceLine} layout="vertical" margin={{ left: 0, right: 12 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" tickFormatter={formatINRAxis} tickLine={false} axisLine={false} tick={TICK} tickCount={4} />
          <YAxis type="category" dataKey="serviceLine" width={120} tickLine={false} axisLine={false} tick={TICK} />
          <ChartTooltip content={<ChartTooltipContent formatter={inr} />} />
          <Bar dataKey="value" fill="var(--chart-1)" {...OUTLINE} radius={3} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
