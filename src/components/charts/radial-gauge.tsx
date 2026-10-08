import Link from "next/link";
import { clampPct } from "./transforms";

interface RadialGaugeProps {
  /** 0-100, or null when there is nothing to measure yet. */
  pct: number | null;
  label: string;
  caption?: string;
  href?: string;
  testId?: string;
}

/** Half-circle gauge: accent fill on a border track, big percentage in the middle. */
export function RadialGauge({ pct, label, caption, href, testId = "chart-gauge" }: RadialGaugeProps) {
  const v = clampPct(pct);
  const r = 80;
  const arc = Math.PI * r;
  const body = (
    <div className="flex flex-col items-center" role="img" aria-label={`${label}: ${pct === null ? "no data" : `${Math.round(v)} percent`}${caption ? `. ${caption}` : ""}`}>
      <svg viewBox="0 0 200 112" className="w-full max-w-60">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--border)" strokeWidth="16" strokeLinecap="round" />
        {v > 0 && <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--accent)" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${(v / 100) * arc} ${arc}`} />}
        <text x="100" y="92" textAnchor="middle" className="tabular" style={{ fill: "var(--text)", fontSize: 30, fontWeight: 600 }}>
          {pct === null ? "—" : `${Math.round(v)}%`}
        </text>
      </svg>
      <p className="-mt-1 text-xs font-medium">{label}</p>
      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
  return href ? (
    <Link href={href} data-testid={testId} className="block rounded-md hover:bg-accent-subtle">
      {body}
    </Link>
  ) : (
    <div data-testid={testId}>{body}</div>
  );
}
