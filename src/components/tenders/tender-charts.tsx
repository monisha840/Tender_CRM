"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatMonth } from "@/lib/dates";
import { getWonLostByMonth } from "@/lib/data/tenders";
import type { TenderRow } from "@/lib/data/tenders";
import { formatINR, formatINRAxis } from "@/lib/money";
import type { RegionFilter } from "@/lib/data/shared";
import { useDb } from "@/store/hooks";
import { moneyToNumber, sumMoney } from "@/lib/money";

interface TipProps {
  active?: boolean;
  payload?: readonly { name?: unknown; value?: unknown; color?: string; payload?: Record<string, unknown> }[];
  label?: unknown;
  format: (value: number) => string;
  title?: (label: unknown, row?: Record<string, unknown>) => string;
}

function Tip({ active, payload, label, format, title }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{title ? title(label, payload[0].payload) : String(label)}</p>
      {payload.map((p, i) => (
        <p key={i} className="tabular flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{String(p.name)}</span>
          <span className="font-medium">{format(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

const countConfig = { count: { label: "Tenders", color: "var(--chart-1)" } } satisfies ChartConfig;
const wonLostConfig = {
  won: { label: "Won", color: "var(--status-success)" },
  lost: { label: "Lost", color: "var(--status-danger)" },
} satisfies ChartConfig;

/** Tender counts per stage; clicking a bar filters the register to that stage. */
export function StageChart({ rows, onSelectStage }: { rows: TenderRow[]; onSelectStage: (stageId: string) => void }) {
  const db = useDb();
  const data = useMemo(
    () =>
      db.tenderStages
        .filter((s) => s.isActive)
        .sort((a, b) => a.sequence - b.sequence)
        .map((stage) => {
          const inStage = rows.filter((r) => r.stage.id === stage.id);
          const status = stage.kind === "WON" ? "var(--status-success)" : stage.kind === "LOST" ? "var(--status-danger)" : "var(--chart-1)";
          return {
            stageId: stage.id,
            stage: stage.name,
            count: inStage.length,
            value: moneyToNumber(sumMoney(inStage.map((r) => r.tender.estimatedValue))),
            fill: status,
            stroke: stage.kind === "OPEN" ? "var(--accent-strong)" : status,
          };
        }),
    [db.tenderStages, rows],
  );

  return (
    <ChartCard
      title="Tenders by stage"
      unit="Number of tenders · select a bar to filter the register"
      isEmpty={rows.length === 0}
      heightClassName="h-64 md:h-72"
      legend={
        <>
          <LegendItem color="var(--chart-1)" label="Open" />
          <LegendItem color="var(--status-success)" label="Won" />
          <LegendItem color="var(--status-danger)" label="Lost" />
        </>
      }
    >
      <ChartContainer config={countConfig} className="aspect-auto h-full w-full">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }} accessibilityLayer>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <YAxis dataKey="stage" type="category" width={104} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
          <ChartTooltip
            cursor={{ fill: "var(--accent-subtle)" }}
            content={
              <Tip
                format={(v) => `${v}`}
                title={(label, row) => `${label} · ${formatINR(Number(row?.value ?? 0), { compact: true })} estimated`}
              />
            }
          />
          <Bar
            isAnimationActive={false}
            dataKey="count"
            name="Tenders"
            radius={3}
            barSize={18}
            strokeWidth={1}
            cursor="pointer"
            onClick={(d) => onSelectStage(String((d as unknown as { stageId: string }).stageId))}
          />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

/** Value won against value lost by month of submission. */
export function WonLostChart({ region }: { region: RegionFilter }) {
  const db = useDb();
  const data = useMemo(
    () => getWonLostByMonth(db, region).map((m) => ({ ...m, label: formatMonth(m.month) })),
    [db, region],
  );
  return (
    <ChartCard
      title="Value won vs lost"
      unit="₹ Cr / ₹ L, by month of submission"
      isEmpty={data.length === 0}
      emptyMessage="No decided tenders for this selection."
      heightClassName="h-64 md:h-72"
      legend={
        <>
          <LegendItem color="var(--status-success)" label="Won" />
          <LegendItem color="var(--status-danger)" label="Lost" />
        </>
      }
    >
      <ChartContainer config={wonLostConfig} className="aspect-auto h-full w-full">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tickFormatter={formatINRAxis} tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11 }} />
          <ChartTooltip cursor={{ fill: "var(--accent-subtle)" }} content={<Tip format={(v) => formatINR(v, { compact: true })} />} />
          <Bar isAnimationActive={false} dataKey="won" name="Won" fill="var(--status-success)" radius={[3, 3, 0, 0]} />
          <Bar isAnimationActive={false} dataKey="lost" name="Lost" fill="var(--status-danger)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
