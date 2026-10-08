import Link from "next/link";
import { clampPct } from "./transforms";

const COLOUR = { GREEN: "var(--status-success)", AMBER: "var(--status-warning)", RED: "var(--status-danger)" } as const;
const WORD = { GREEN: "On track", AMBER: "At risk", RED: "Delayed" } as const;

interface ProgressRingProps {
  name: string;
  /** Actual progress, 0-100. */
  actual: number;
  /** Planned progress, 0-100, drawn as a tick on the ring. */
  planned: number;
  health: keyof typeof COLOUR;
  href: string;
  testId?: string;
}

/** Ring showing actual progress (health coloured) with a dark tick where the plan says it should be. */
export function ProgressRing({ name, actual, planned, health, href, testId = "chart-progress-ring" }: ProgressRingProps) {
  const a = clampPct(actual);
  const p = clampPct(planned);
  const r = 24;
  const c = 2 * Math.PI * r;
  const angle = (p / 100) * 2 * Math.PI;
  const ix = 32 + Math.cos(angle) * (r - 6);
  const iy = 32 + Math.sin(angle) * (r - 6);
  const ox = 32 + Math.cos(angle) * (r + 6);
  const oy = 32 + Math.sin(angle) * (r + 6);
  return (
    <Link href={href} data-testid={testId} aria-label={`${name}: ${Math.round(a)} percent done, ${Math.round(p)} percent planned, ${WORD[health]}`} className="flex min-h-11 items-center gap-2.5 rounded-md p-1.5 hover:bg-accent-subtle">
      <svg viewBox="0 0 64 64" className="size-14 shrink-0 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
        {a > 0 && <circle cx="32" cy="32" r={r} fill="none" stroke={COLOUR[health]} strokeWidth="7" strokeDasharray={`${(a / 100) * c} ${c}`} />}
        <line x1={ix} y1={iy} x2={ox} y2={oy} stroke="var(--text)" strokeWidth="2" />
      </svg>
      <span className="min-w-0">
        <span className="tabular block text-sm leading-none font-semibold">{Math.round(a)}%</span>
        <span className="mt-1 block truncate text-xs font-medium">{name}</span>
        <span className="tabular block text-[11px] text-muted-foreground">
          plan {Math.round(p)}% · {WORD[health]}
        </span>
      </span>
    </Link>
  );
}
