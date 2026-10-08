"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { ChartTooltipContent } from "./chart-tooltip";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Drill-down target when the slice is clicked. */
  href?: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  /** Formats the value in the tooltip and legend (INR, count…). */
  format: (value: number) => string;
  /** Big text in the hole. */
  centre?: ReactNode;
  testId?: string;
}

/** Donut with a centre label and a text legend below (stacks cleanly at 360px). Zero slices are dropped from the ring but kept in the legend. */
export function DonutChart({ slices, format, centre, testId = "chart-donut" }: DonutChartProps) {
  const router = useRouter();
  const live = slices.filter((s) => s.value > 0);
  const config: ChartConfig = Object.fromEntries(slices.map((s) => [s.key, { label: s.label, color: s.color }]));
  return (
    <div className="flex h-full flex-col gap-2" data-testid={testId}>
      <div className="relative min-h-0 flex-1">
        <ChartContainer config={config} className="aspect-auto h-full w-full">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="key" formatter={(v, _n, item) => (
              <span className="flex w-full items-center justify-between gap-4">
                <span className="text-muted-foreground">{String((item as { payload?: { label?: string } }).payload?.label ?? "")}</span>
                <span className="tabular font-medium">{format(Number(v))}</span>
              </span>
            )} />} />
            <Pie
              data={live}
              dataKey="value"
              nameKey="key"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={live.length > 1 ? 2 : 0}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
              onClick={(d) => {
                const href = (d as unknown as { href?: string }).href;
                if (href) router.push(href);
              }}
            >
              {live.map((s) => (
                <Cell key={s.key} fill={s.color} className={s.href ? "cursor-pointer" : undefined} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        {centre && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">{centre}</div>}
      </div>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {slices.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5" data-testid={`${testId}-legend-${s.key}`}>
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden="true" />
            {s.label}
            <span className="tabular font-medium text-foreground">{format(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
