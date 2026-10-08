"use client";

import { useRouter } from "next/navigation";
import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import { formatINR } from "@/lib/money";

/** Fill and a readable text colour for it (checked against the chart tokens: dark on light fills, surface on dark fills). */
const PALETTE = [
  { fill: "var(--chart-1)", text: "var(--accent-foreground)" },
  { fill: "var(--chart-2)", text: "var(--surface)" },
  { fill: "var(--chart-3)", text: "var(--accent-foreground)" },
  { fill: "var(--chart-4)", text: "var(--surface)" },
  { fill: "var(--chart-5)", text: "var(--accent-foreground)" },
];

export interface TreemapDatum {
  [key: string]: unknown;
  name: string;
  value: number;
  href?: string;
}

interface CellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  name?: string;
  value?: number;
  href?: string;
}

function Cell({ x = 0, y = 0, width = 0, height = 0, index = 0, name = "", value = 0, href, onPick }: CellProps & { onPick: (href?: string) => void }) {
  const p = PALETTE[index % PALETTE.length];
  const showName = width > 56 && height > 28;
  const showValue = width > 56 && height > 46;
  return (
    <g onClick={() => onPick(href)} className={href ? "cursor-pointer" : undefined}>
      <rect x={x} y={y} width={width} height={height} fill={p.fill} stroke="var(--surface)" strokeWidth={2} rx={3} />
      {showName && (
        <text x={x + 8} y={y + 18} fill={p.text} fontSize={12} fontWeight={600}>
          {name.length > Math.floor(width / 7) ? `${name.slice(0, Math.max(3, Math.floor(width / 7) - 1))}…` : name}
        </text>
      )}
      {showValue && (
        <text x={x + 8} y={y + 34} fill={p.text} fontSize={11}>
          {formatINR(value, { compact: "auto" })}
        </text>
      )}
    </g>
  );
}

/** Treemap of value shares; labels hide in tiles that are too small and the tooltip always has the full name and INR value. */
export function TreemapChart({ data, testId = "chart-treemap" }: { data: TreemapDatum[]; testId?: string }) {
  const router = useRouter();
  const onPick = (href?: string) => {
    if (href) router.push(href);
  };
  return (
    <div className="h-full w-full" data-testid={testId}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 220 }}>
        <Treemap data={data} dataKey="value" nameKey="name" isAnimationActive={false} content={<Cell onPick={onPick} />}>
          <Tooltip
            content={({ payload }) => {
              const d = payload?.[0]?.payload as TreemapDatum | undefined;
              if (!d) return null;
              return (
                <div className="rounded-lg border bg-surface px-2.5 py-1.5 text-xs">
                  <span className="mr-3 text-muted-foreground">{d.name}</span>
                  <span className="tabular font-medium">{formatINR(d.value, { compact: true })}</span>
                </div>
              );
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}
