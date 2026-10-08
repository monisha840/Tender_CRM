"use client";

import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { SizedContainer } from "@/components/charts/sized-container";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { formatMonth } from "@/lib/dates";
import { formatINR, moneyToNumber } from "@/lib/money";
import { FLAG_LABEL, type PnlFlag, type PnlMonth } from "@/modules/contract-pnl/calc";

const FLAG_TONE: Record<PnlFlag, StatusTone> = { LOSS: "danger", LOW: "warning", OK: "success", NO_BILLING: "neutral" };
const axis = { fontSize: 11, fill: "var(--text-secondary)" };

export const formatPct = (pct: number | null): string => (pct === null ? "—" : `${pct.toFixed(1)}%`);

export function FlagBadge({ flag }: { flag: PnlFlag }) {
  return <StatusBadge tone={FLAG_TONE[flag]} label={FLAG_LABEL[flag]} />;
}

/** Monthly billed vs cost (bars) with the margin line. */
export function MarginTrendChart({ monthly, title = "Margin trend" }: { monthly: PnlMonth[]; title?: string }) {
  const data = monthly.map((m) => ({
    label: formatMonth(m.month),
    Billed: moneyToNumber(m.billed),
    Cost: moneyToNumber(m.cost),
    Margin: moneyToNumber(m.margin),
  }));
  return (
    <ChartCard
      title={title}
      unit="₹ Cr / ₹ L per month"
      isEmpty={data.length === 0}
      emptyMessage="No billing or cost recorded yet."
      legend={
        <>
          <LegendItem color="var(--chart-1)" label="Billed" />
          <LegendItem color="var(--chart-3)" label="Cost" />
          <LegendItem color="var(--accent-strong)" label="Margin" />
        </>
      }
    >
      <SizedContainer>
        <ComposedChart data={data} margin={{ left: 4, right: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={axis} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={axis} width={64} tickFormatter={(v: number) => formatINR(v, { compact: true })} />
          <Tooltip formatter={(v) => formatINR(Number(v))} />
          <Bar dataKey="Billed" fill="var(--chart-1)" stroke="var(--accent-strong)" strokeWidth={1} radius={[3, 3, 0, 0]} />
          <Bar dataKey="Cost" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
          <Line dataKey="Margin" stroke="var(--accent-strong)" strokeWidth={2} dot={false} />
        </ComposedChart>
      </SizedContainer>
    </ChartCard>
  );
}
