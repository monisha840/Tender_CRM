import { sparkPoints } from "./transforms";

interface SparklineProps {
  values?: number[];
  className?: string;
  label?: string;
}

/** Tiny flat line with an end dot for KPI tiles. Renders nothing for fewer than two points. */
export function Sparkline({ values, className = "h-8 w-full", label = "Trend" }: SparklineProps) {
  const pts = sparkPoints(values);
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const w = 100;
  const h = 28;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * w, 3 + (1 - (v - min) / span) * (h - 6)] as const);
  const last = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} role="img" aria-label={label} data-testid="chart-sparkline">
      <polyline points={xy.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="var(--accent-strong)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill="var(--accent)" stroke="var(--accent-strong)" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
