import { AlertTriangle, CheckCircle2, Circle, CircleDot, Clock, XCircle, type LucideIcon } from "lucide-react";
import { relativeDeadline, type DeadlineTone } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "neutral" | "accent";

const TONE_STYLE: Record<StatusTone, { className: string; icon: LucideIcon }> = {
  success: { className: "bg-status-success-tint text-status-success", icon: CheckCircle2 },
  warning: { className: "bg-status-warning-tint text-status-warning", icon: Clock },
  danger: { className: "bg-status-danger-tint text-status-danger", icon: XCircle },
  neutral: { className: "bg-status-neutral-tint text-status-neutral", icon: Circle },
  /** Neutral navy tint for "in motion" states that are neither good nor bad (e.g. Submitted). */
  accent: { className: "bg-accent-tint text-accent", icon: CircleDot },
};

interface StatusMeta {
  label: string;
  tone: StatusTone;
}

/**
 * One registry for every status in the app, so the same state has the same label and colour
 * in every module (CLAUDE.md → Usability principles). Add new statuses here, not at call sites.
 */
const STATUS: Record<string, StatusMeta> = {
  // Good / done
  APPROVED: { label: "Approved", tone: "success" },
  PAID: { label: "Paid", tone: "success" },
  RECEIVED: { label: "Received", tone: "success" },
  COMPLETED: { label: "Completed", tone: "success" },
  READY: { label: "Ready", tone: "success" },
  MET: { label: "Met", tone: "success" },
  RESOLVED: { label: "Resolved", tone: "success" },
  QUALIFIED: { label: "Qualified", tone: "success" },
  REFUNDED: { label: "Refunded", tone: "success" },
  REVIEWED: { label: "Reviewed", tone: "success" },
  PRESENT: { label: "Present", tone: "success" },
  WON: { label: "Won", tone: "success" },
  ACTIVE: { label: "Active", tone: "success" },
  GREEN: { label: "On track", tone: "success" },
  // Waiting / needs a look
  PENDING: { label: "Pending", tone: "warning" },
  PENDING_APPROVAL: { label: "Pending approval", tone: "warning" },
  IN_PROGRESS: { label: "In progress", tone: "warning" },
  OPEN: { label: "Open", tone: "warning" },
  PARTLY_PAID: { label: "Partly paid", tone: "warning" },
  PARTLY_RECEIVED: { label: "Partly received", tone: "warning" },
  CERTIFIED: { label: "Certified", tone: "warning" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "warning" },
  HALF_DAY: { label: "Half day", tone: "warning" },
  ARRANGED: { label: "Arranged", tone: "warning" },
  AMBER: { label: "At risk", tone: "warning" },
  MEDIUM: { label: "Medium", tone: "warning" },
  // Bad
  REJECTED: { label: "Rejected", tone: "danger" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  LOST: { label: "Lost", tone: "danger" },
  ABSENT: { label: "Absent", tone: "danger" },
  FORFEITED: { label: "Forfeited", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "danger" },
  BLACKLISTED: { label: "Blacklisted", tone: "danger" },
  HIGH: { label: "High", tone: "danger" },
  RED: { label: "Delayed", tone: "danger" },
  // Neutral
  DRAFT: { label: "Draft", tone: "neutral" },
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  NO_GO: { label: "No-Go", tone: "neutral" },
  NA: { label: "N/A", tone: "neutral" },
  ON_HOLD: { label: "On hold", tone: "neutral" },
  LEAVE: { label: "On leave", tone: "neutral" },
  WEEKOFF: { label: "Week off", tone: "neutral" },
  HOLIDAY: { label: "Holiday", tone: "neutral" },
  LOCKED: { label: "Locked", tone: "neutral" },
  LOW: { label: "Low", tone: "neutral" },
  // In motion
  SUBMITTED: { label: "Submitted", tone: "accent" },
  ORDERED: { label: "Ordered", tone: "accent" },
  SUBMITTED_BID: { label: "Submitted", tone: "accent" },
};

const humanise = (s: string) => {
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function statusMeta(status: string): StatusMeta {
  return STATUS[status] ?? { label: humanise(status), tone: "neutral" };
}

interface StatusBadgeProps {
  /** A key from the registry, e.g. "APPROVED" or "AMBER". Unknown keys render neutral. */
  status?: string;
  /** Override the tone and/or label (e.g. for a configurable tender stage name). */
  tone?: StatusTone;
  label?: string;
  className?: string;
}

/** Status is always colour + icon + text, never colour alone. */
export function StatusBadge({ status, tone, label, className }: StatusBadgeProps) {
  const meta = status ? statusMeta(status) : { label: "", tone: "neutral" as StatusTone };
  const finalTone = tone ?? meta.tone;
  const { className: toneClass, icon: Icon } = TONE_STYLE[finalTone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClass,
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      {label ?? meta.label}
    </span>
  );
}

/** Tender stage kinds map to a tone; the label stays whatever the (configurable) stage is called. */
export function StageBadge({ name, kind }: { name: string; kind: "OPEN" | "WON" | "LOST" | "NO_GO" | "TERMINAL" }) {
  const tone: StatusTone = kind === "WON" ? "success" : kind === "LOST" ? "danger" : kind === "OPEN" ? "accent" : "neutral";
  return <StatusBadge tone={tone} label={name} />;
}

const DEADLINE_TONE: Record<DeadlineTone, StatusTone> = { overdue: "danger", urgent: "danger", soon: "warning", normal: "neutral" };

/** "in 3 days" / "2 days overdue" with urgency colour. */
export function DeadlineBadge({ value, className }: { value: string; className?: string }) {
  const d = relativeDeadline(value);
  const tone = DEADLINE_TONE[d.tone];
  const Icon = tone === "danger" ? AlertTriangle : TONE_STYLE[tone].icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONE_STYLE[tone].className, className)}>
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      {d.label}
    </span>
  );
}
