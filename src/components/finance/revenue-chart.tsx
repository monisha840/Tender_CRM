"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { SizedContainer } from "@/components/charts/sized-container";
import { formatMonth } from "@/lib/dates";
import { getRevenueExpenses } from "@/lib/data/dashboard13";
import { formatINR, formatINRAxis } from "@/lib/money";
import { useAsOfDb } from "@/components/layout/use-as-of-db";
import { useRegionFilter } from "@/store/hooks";

const short = (m: string) => `${formatMonth(m).slice(0, 3)} ${m.slice(2, 4)}`;

export function RevenueExpensesChart() {
  const db = useAsOfDb();
  const { region } = useRegionFilter();
  const data = useMemo(() => getRevenueExpenses(db, region, 12), [db, region]);
  const empty = data.totalRevenue === 0 && data.totalExpenses === 0;
  return (
    <ChartCard
      title="Revenue vs Expenses"
      unit={`₹, last 12 months · margin ${data.marginPct.toFixed(1)}% · revenue = invoiced value before GST, expenses = actual project cost`}
      isEmpty={empty}
      className="mb-4"
      legend={
        <>
          <LegendItem color="var(--chart-1)" label={`Revenue ${formatINR(data.totalRevenue, { compact: true })}`} />
          <LegendItem color="var(--chart-4)" label={`Expenses ${formatINR(data.totalExpenses, { compact: true })}`} />
        </>
      }
    >
      <SizedContainer>
        <BarChart data={data.months} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickFormatter={short} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
          <YAxis tickFormatter={formatINRAxis} tickLine={false} axisLine={false} width={56} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: "var(--accent-subtle)" }}
            labelFormatter={(m) => formatMonth(String(m))}
            formatter={(v, name) => [formatINR(Number(v)), name === "revenue" ? "Revenue" : "Expenses"]}
            contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
          />
          <Bar dataKey="revenue" fill="var(--chart-1)" stroke="var(--accent-strong)" strokeWidth={1} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="expenses" fill="var(--chart-4)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </SizedContainer>
    </ChartCard>
  );
}
