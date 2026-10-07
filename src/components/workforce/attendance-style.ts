import type { AttendanceStatus } from "@/types";

/** One letter per status for the monthly grid; status is always letter + colour, never colour alone. */
export const STATUS_CODE: Record<AttendanceStatus, string> = { PRESENT: "P", ABSENT: "A", HALF_DAY: "H", LEAVE: "L", HOLIDAY: "O", WEEKOFF: "W" };

export const STATUS_CELL: Record<AttendanceStatus, string> = {
  PRESENT: "bg-status-success-tint text-status-success",
  ABSENT: "bg-status-danger-tint text-status-danger",
  HALF_DAY: "bg-status-warning-tint text-status-warning",
  LEAVE: "bg-status-neutral-tint text-status-neutral",
  HOLIDAY: "bg-status-neutral-tint text-status-neutral",
  WEEKOFF: "bg-background text-muted-foreground",
};
