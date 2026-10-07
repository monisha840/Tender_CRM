"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ClipboardCheck } from "lucide-react";
import { ImportExport } from "@/components/data/import-export";
import { getAttendanceSummary } from "@/lib/data";
import { buildAttendance } from "@/modules/workforce/entry";
import { useDataStore } from "@/store/data-store";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiTile } from "@/components/shared/kpi-tile";
import { STATUS_CELL, STATUS_CODE } from "@/components/workforce/attendance-style";
import { FilterSelect } from "@/components/workforce/filter-select";
import { WorkforceTabs } from "@/components/workforce/workforce-tabs";
import { addDays, formatDate, formatMonth, getToday } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { attendanceMonths, getAttendanceGrid, getStaffedSites } from "@/modules/workforce/queries";
import { useCurrentPersona, useDb, useRegionFilter } from "@/store/hooks";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function AttendancePage() {
  const db = useDb();
  const upsert = useDataStore((s) => s.upsert);
  const persona = useCurrentPersona();
  const { region } = useRegionFilter();
  const sites = useMemo(() => getStaffedSites(db, region), [db, region]);
  const months = useMemo(() => attendanceMonths(), []);
  const [siteChoice, setSite] = useState("");
  const [month, setMonth] = useState(months[0]);
  const siteId = sites.some((s) => s.id === siteChoice) ? siteChoice : (sites[0]?.id ?? "");

  const grid = useMemo(() => (siteId ? getAttendanceGrid(db, siteId, month) : []), [db, siteId, month]);
  const [y, m] = month.split("-").map(Number);
  const dates = Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const today = getToday();

  const present = grid.reduce((t, r) => t + r.daysWorked, 0);
  const absent = grid.reduce((t, r) => t + r.absent, 0);
  const leave = grid.reduce((t, r) => t + r.leave, 0);
  const overtime = grid.reduce((t, r) => t + r.overtimeHours, 0);

  const notMarkedToday = useMemo(() => getAttendanceSummary(db, today, region).notMarked, [db, region, today]);
  const siteNotMarked = siteId ? Math.max(0, db.siteAssignments.filter((a) => a.siteId === siteId && a.fromDate <= today && (!a.toDate || a.toDate >= today)).length - db.attendance.filter((a) => a.siteId === siteId && a.date === today).length) : 0;

  const gridHeaders = ["code", "name", ...dates.map((d) => d.slice(8))];
  const gridRows = grid.map((r) => [r.code, r.name, ...dates.map((d) => (r.byDate[d] ? STATUS_CODE[r.byDate[d].status] : ""))]);
  const flatRows = grid.flatMap((r) => dates.filter((d) => r.byDate[d]).map((d) => [r.code, d, r.byDate[d].status]));

  const importAttendance = (records: Record<string, string>[]) => {
    const errors: string[] = [];
    let imported = 0;
    records.forEach((rec, i) => {
      const res = buildAttendance(useDataStore.getState().db, rec, persona.user.id);
      if ("error" in res) errors.push(`Row ${i + 2}: ${res.error}`);
      else {
        upsert("attendance", res.row);
        imported++;
      }
    });
    return { imported, errors };
  };

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Monthly attendance by site, as marked by site supervisors."
        primaryAction={{ label: "Mark attendance", icon: ClipboardCheck, href: "/employees/attendance/mark" }}
      />
      <WorkforceTabs />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex">
        <FilterSelect label="Site" value={siteId} onChange={setSite} options={sites.map((s) => ({ value: s.id, label: s.name }))} className="col-span-2 sm:min-w-56" />
        <FilterSelect label="Month" value={month} onChange={setMonth} options={months.map((p) => ({ value: p, label: formatMonth(p) }))} className="col-span-2" />
      </div>

      {notMarkedToday > 0 && (
        <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-status-warning bg-status-warning-tint px-3 py-2 text-sm text-status-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Attendance not marked today ({formatDate(today)}) for {notMarkedToday} {notMarkedToday === 1 ? "person" : "people"}
            {siteId && siteNotMarked > 0 ? `, ${siteNotMarked} at this site` : ""}.{" "}
            <Link href="/employees/attendance/mark" className="font-medium underline">Mark attendance</Link>
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4">
        <ImportExport filename={`attendance-grid-${month}`} headers={gridHeaders} rows={gridRows} />
        <ImportExport
          filename={`attendance-${month}`}
          headers={["code", "date", "status"]}
          rows={flatRows}
          onImport={importAttendance}
        />
      </div>

      {grid.length === 0 ? (
        <div className="rounded-lg border bg-surface">
          <EmptyState message="No attendance recorded for this site and month." action={{ label: "Mark attendance", href: "/employees/attendance/mark" }} />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Staff at site" value={String(grid.length)} />
            <KpiTile label="Days worked" value={fmt(present)} hint="Full + half days" />
            <KpiTile label="Absent / leave" value={`${absent} / ${leave}`} hint="Days" />
            <KpiTile label="Overtime" value={`${fmt(Math.round(overtime))} h`} />
          </div>

          <p className="mb-2 text-xs text-muted-foreground">
            <span className="font-medium">P</span> present · <span className="font-medium">H</span> half day · <span className="font-medium">A</span> absent · <span className="font-medium">L</span> leave ·{" "}
            <span className="font-medium">W</span> week off
          </p>

          {/* Desktop / tablet grid: genuinely wide, so the container scrolls and the name column stays put. */}
          <div className="hidden overflow-x-auto rounded-lg border bg-surface md:block">
            <table className="w-full border-collapse text-xs">
              <caption className="sr-only">Attendance grid for {formatMonth(month)}</caption>
              <thead>
                <tr className="border-b bg-background text-muted-foreground">
                  <th className="sticky left-0 z-10 min-w-44 bg-background px-3 py-2 text-left font-medium">Employee</th>
                  {dates.map((d) => (
                    <th key={d} className="tabular w-7 min-w-7 px-0 py-2 text-center font-medium">{d.slice(8)}</th>
                  ))}
                  <th className="px-2 py-2 text-right font-medium">Days</th>
                  <th className="px-2 py-2 text-right font-medium">Abs</th>
                  <th className="px-2 py-2 text-right font-medium">Leave</th>
                  <th className="px-2 py-2 text-right font-medium">OT h</th>
                </tr>
              </thead>
              <tbody>
                {grid.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-left font-normal">
                      <Link href={`/employees/${r.id}`} className="block text-sm font-medium hover:underline">{r.name}</Link>
                      <span className="text-muted-foreground">{r.code} · {r.designation}</span>
                    </th>
                    {dates.map((d) => {
                      const a = r.byDate[d];
                      return (
                        <td key={d} className="p-0.5 text-center">
                          {a ? (
                            <span title={`${d}: ${a.status.replace("_", " ").toLowerCase()}`} className={cn("inline-flex size-6 items-center justify-center rounded font-medium", STATUS_CELL[a.status])}>
                              {STATUS_CODE[a.status]}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50" aria-label={d > today ? "upcoming" : "not marked"}>·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="tabular px-2 text-right font-medium">{fmt(r.daysWorked)}</td>
                    <td className="tabular px-2 text-right">{r.absent}</td>
                    <td className="tabular px-2 text-right">{r.leave}</td>
                    <td className="tabular px-2 text-right">{fmt(Math.round(r.overtimeHours))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: one card per person, with a day-by-day strip. */}
          <ul className="space-y-2 md:hidden">
            {grid.map((r) => (
              <li key={r.id} className="rounded-lg border bg-surface p-3">
                <Link href={`/employees/${r.id}`} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">{r.name}</span>
                  <span className="tabular shrink-0 text-xs text-muted-foreground">{r.code}</span>
                </Link>
                <p className="text-xs text-muted-foreground">{r.designation}</p>
                <p className="tabular mt-2 text-xs">
                  <span className="font-semibold">{fmt(r.daysWorked)}</span> days · {r.absent} absent · {r.leave} leave · {fmt(Math.round(r.overtimeHours))} h OT
                </p>
                <ul className="mt-2 flex flex-wrap gap-0.5" aria-label="Day by day">
                  {dates.map((d) => {
                    const a = r.byDate[d];
                    return (
                      <li key={d} className={cn("tabular inline-flex size-[22px] items-center justify-center rounded text-[10px] font-medium", a ? STATUS_CELL[a.status] : "bg-background text-muted-foreground/50")}>
                        {a ? STATUS_CODE[a.status] : "·"}
                        <span className="sr-only">{d.slice(8)}</span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Data to {addDays(today, 0).split("-").reverse().join("-")}. Office staff are not marked at a site.</p>
    </>
  );
}
