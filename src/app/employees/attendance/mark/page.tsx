"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/workforce/filter-select";
import { addDays, formatDate, getToday, istToUtc } from "@/lib/dates";
import { byId } from "@/lib/data";
import { cn } from "@/lib/utils";
import { getStaffedSites } from "@/modules/workforce/queries";
import { useCurrentPersona, useRegionFilter } from "@/store/hooks";
import { useDataStore } from "@/store/data-store";
import type { Attendance, AttendanceStatus } from "@/types";

type Mark = Extract<AttendanceStatus, "PRESENT" | "HALF_DAY" | "ABSENT" | "LEAVE">;
const OPTIONS: { value: Mark; label: string; fraction: number; on: string }[] = [
  { value: "PRESENT", label: "Present", fraction: 1, on: "border-status-success bg-status-success-tint text-status-success" },
  { value: "HALF_DAY", label: "Half day", fraction: 0.5, on: "border-status-warning bg-status-warning-tint text-status-warning" },
  { value: "ABSENT", label: "Absent", fraction: 0, on: "border-status-danger bg-status-danger-tint text-status-danger" },
  { value: "LEAVE", label: "Leave", fraction: 0, on: "border-status-neutral bg-status-neutral-tint text-status-neutral" },
];

export default function MarkAttendancePage() {
  const db = useDataStore((s) => s.db);
  const upsert = useDataStore((s) => s.upsert);
  const persona = useCurrentPersona();
  const { region } = useRegionFilter();
  const today = getToday();

  const sites = useMemo(() => getStaffedSites(db, region), [db, region]);
  const [siteChoice, setSite] = useState("");
  const [date, setDate] = useState(today);
  const siteId = sites.some((s) => s.id === siteChoice) ? siteChoice : (sites[0]?.id ?? "");

  // Everyone currently assigned at the site, with whatever is already recorded for the date.
  const staff = useMemo(() => {
    const ids = new Set(db.siteAssignments.filter((a) => a.siteId === siteId && a.fromDate <= date && (!a.toDate || a.toDate >= date)).map((a) => a.employeeId));
    return [...ids]
      .map((id) => {
        const e = byId(db.employees, id)!;
        const assignment = db.siteAssignments.find((a) => a.employeeId === id && a.siteId === siteId && !a.toDate) ?? db.siteAssignments.find((a) => a.employeeId === id && a.siteId === siteId)!;
        const existing = db.attendance.find((a) => a.employeeId === id && a.date === date);
        return { employee: e, assignment, existing };
      })
      .sort((a, b) => a.employee.code.localeCompare(b.employee.code));
  }, [db, siteId, date]);

  // Existing records for the day, overlaid with this session's taps (kept per site and date).
  const [edits, setEdits] = useState<Record<string, Record<string, Mark>>>({});
  const editKey = `${siteId}|${date}`;
  const marks = useMemo(() => {
    const initial: Record<string, Mark> = {};
    staff.forEach(({ employee, existing }) => {
      if (existing && ["PRESENT", "HALF_DAY", "ABSENT", "LEAVE"].includes(existing.status)) initial[employee.id] = existing.status as Mark;
    });
    return { ...initial, ...edits[editKey] };
  }, [staff, edits, editKey]);
  const setMarks = (next: Record<string, Mark>) => setEdits((e) => ({ ...e, [editKey]: next }));

  const marked = staff.filter((s) => marks[s.employee.id]).length;
  const markAllPresent = () => setMarks(Object.fromEntries(staff.map((s) => [s.employee.id, marks[s.employee.id] ?? "PRESENT"])));

  const save = () => {
    const now = istToUtc(today, "10:30");
    staff.forEach(({ employee, assignment, existing }) => {
      const status = marks[employee.id];
      if (!status) return;
      const fraction = OPTIONS.find((o) => o.value === status)!.fraction;
      const row: Attendance = {
        id: existing?.id ?? `att_${employee.id}_${date}`,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        employeeId: employee.id,
        siteId,
        projectId: assignment.projectId,
        regionId: byId(db.sites, siteId)!.regionId,
        date,
        status,
        dayFraction: fraction,
        overtimeMinutes: status === "PRESENT" ? (existing?.overtimeMinutes ?? 0) : 0,
        source: "SUPERVISOR",
        markedById: persona.user.id,
        clientUuid: existing?.clientUuid ?? `att-${employee.id}-${date}`,
      };
      upsert("attendance", row);
    });
    toast.success(`Attendance saved for ${marked} of ${staff.length} staff on ${formatDate(date)}`);
  };

  return (
    <>
      <Link href="/employees/attendance" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-accent-strong hover:underline md:min-h-8">
        <ArrowLeft className="size-4" aria-hidden="true" /> Attendance
      </Link>
      <PageHeader title="Mark attendance" description="Tap a status for each person, then save." />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 sm:max-w-2xl">
        <FilterSelect label="Site" value={siteId} onChange={setSite} options={sites.map((s) => ({ value: s.id, label: s.name }))} />
        <input
          type="date"
          aria-label="Date"
          value={date}
          min={addDays(today, -7)}
          max={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="tabular h-11 w-full rounded-md border bg-surface px-2.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:h-9"
        />
      </div>

      {staff.length === 0 ? (
        <div className="rounded-lg border bg-surface">
          <EmptyState message="No staff are assigned to this site on this date." />
        </div>
      ) : (
        <div className="pb-24 md:pb-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="tabular text-sm text-muted-foreground">{marked} of {staff.length} marked</p>
            <Button variant="outline" onClick={markAllPresent} className="h-11 md:h-8">Mark all present</Button>
          </div>
          <ul className="space-y-2">
            {staff.map(({ employee, assignment }) => (
              <li key={employee.id} className="rounded-lg border bg-surface p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">{employee.name}</p>
                  <p className="tabular shrink-0 text-xs text-muted-foreground">{employee.code} · {assignment.role}</p>
                </div>
                <div role="radiogroup" aria-label={`Attendance for ${employee.name}`} className="grid grid-cols-4 gap-1.5">
                  {OPTIONS.map((o) => {
                    const on = marks[employee.id] === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setMarks({ ...marks, [employee.id]: o.value })}
                        className={cn(
                          "flex min-h-11 items-center justify-center gap-1 rounded-md border px-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          on ? o.on : "bg-surface text-muted-foreground hover:bg-accent-subtle",
                        )}
                      >
                        {on && <Check className="size-3 shrink-0" aria-hidden="true" />}
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
          {/* Sticky save: sits above the phone bottom bar (56px). */}
          <div className="fixed inset-x-0 bottom-14 z-30 border-t bg-surface p-3 md:static md:mt-4 md:border-0 md:bg-transparent md:p-0">
            <Button onClick={save} disabled={marked === 0} className="h-12 w-full md:h-9 md:w-auto">
              Save attendance ({marked})
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
