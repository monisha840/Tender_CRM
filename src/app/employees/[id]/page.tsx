"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Timeline } from "@/components/shared/timeline";
import { STATUS_CELL } from "@/components/workforce/attendance-style";
import { WorkforceTabs } from "@/components/workforce/workforce-tabs";
import { byId, regionName } from "@/lib/data";
import { formatDate, formatMonth, getToday, lastNDays } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useDb } from "@/store/hooks";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const db = useDb();
  const employee = byId(db.employees, id);
  const profile = db.employeeProfiles.find((p) => p.employeeId === id);

  const data = useMemo(() => {
    if (!employee || !profile) return null;
    const labour = byId(db.labourTypes, profile.labourTypeId);
    const assignments = db.siteAssignments
      .filter((a) => a.employeeId === id)
      .sort((a, b) => a.fromDate.localeCompare(b.fromDate))
      .map((a) => ({ ...a, site: byId(db.sites, a.siteId)?.name ?? "—", project: byId(db.projects, a.projectId)?.name ?? "—" }));
    const slips = db.payslips
      .filter((p) => p.employeeId === id)
      .map((p) => ({ p, period: byId(db.payrollRuns, p.payrollRunId)?.periodMonth ?? "" }))
      .sort((a, b) => b.period.localeCompare(a.period));
    const att = new Map(db.attendance.filter((a) => a.employeeId === id).map((a) => [a.date, a]));
    return { labour, assignments, slips, att };
  }, [db, id, employee, profile]);

  if (!employee || !profile || !data) {
    return <EmptyState message="This employee was not found." action={{ label: "Back to employees", href: "/employees" }} />;
  }
  const { labour, assignments, slips, att } = data;
  const current = assignments.filter((a) => !a.toDate || a.toDate >= getToday());
  const days = lastNDays(30);
  const counts: Record<string, number> = {};
  days.forEach((d) => {
    const s = att.get(d)?.status;
    if (s) counts[s] = (counts[s] ?? 0) + 1;
  });
  const latest = slips[0];

  return (
    <>
      <Link href="/employees" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-accent-strong hover:underline md:min-h-8">
        <ArrowLeft className="size-4" aria-hidden="true" /> Employees
      </Link>
      <PageHeader
        title={employee.name}
        description={`${employee.code} · ${profile.designation}`}
        status={
          latest ? (
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              {formatMonth(latest.period)} salary <StatusBadge status={latest.p.paymentStatus} />
            </span>
          ) : (
            <StatusBadge status="NA" label="Not on payroll" />
          )
        }
      />
      <WorkforceTabs />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border bg-surface p-4 lg:col-span-2" aria-label="Profile">
          <h2 className="mb-3 text-sm font-semibold">Profile</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
            <Field label="Employee code"><span className="tabular">{employee.code}</span></Field>
            <Field label="Name">{employee.name}</Field>
            <Field label="Phone"><span className="tabular">{employee.phone ?? "—"}</span></Field>
            <Field label="Site">{current.length ? current.map((a) => a.site).join(", ") : "Office / unassigned"}</Field>
            <Field label="Designation">{profile.designation}</Field>
            <Field label="Department">{profile.department}</Field>
            <Field label="Joining date"><span className="tabular">{formatDate(profile.joiningDate)}</span></Field>
            <Field label={labour?.payrollMode === "DAILY" ? "Salary (daily rate)" : "Salary (monthly)"}>
              <span className="tabular font-medium">{formatINR(profile.wageAmount)}</span>
            </Field>
            <Field label="Advance outstanding"><span className="tabular font-medium">{formatINR(profile.advanceBalance)}</span></Field>
            <Field label="Region">{regionName(db, employee.homeRegionId)}</Field>
            <Field label="Labour type">{labour?.name ?? "—"}</Field>
            <Field label="UAN"><span className="tabular">{profile.uan ?? "—"}</span></Field>
            <Field label="PF applicable">{profile.pfApplicable ? "Yes" : "No"}</Field>
            <Field label="ESI applicable">{profile.esiApplicable ? "Yes" : "No"}</Field>
          </dl>
        </section>

        <section className="rounded-lg border bg-surface p-4" aria-label="Site assignments">
          <h2 className="mb-3 text-sm font-semibold">Site assignment history</h2>
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not assigned to a site.</p>
          ) : (
            <Timeline
              entries={assignments.map((a) => ({
                id: a.id,
                title: a.site,
                time: `${formatDate(a.fromDate)} → ${a.toDate ? formatDate(a.toDate) : "now"}`,
                description: `${a.role} · ${a.project}${a.reason ? ` · ${a.reason}` : ""}`,
                tone: a.toDate ? "neutral" : "accent",
              }))}
            />
          )}
        </section>
      </div>

      <section className="mt-6 rounded-lg border bg-surface p-4" aria-label="Attendance, last 30 days">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Attendance, last 30 days</h2>
          <p className="tabular text-xs text-muted-foreground">
            Present {counts.PRESENT ?? 0} · Half day {counts.HALF_DAY ?? 0} · Absent {counts.ABSENT ?? 0} · Leave {counts.LEAVE ?? 0}
          </p>
        </div>
        {att.size === 0 ? (
          <p className="text-sm text-muted-foreground">No site attendance recorded (office staff are not marked at a site).</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-1">
              {days.map((d) => {
                const s = att.get(d)?.status;
                return (
                  <li
                    key={d}
                    title={`${formatDate(d)}${s ? ` — ${s.replace("_", " ").toLowerCase()}` : ""}`}
                    className={cn("tabular inline-flex size-8 items-center justify-center rounded-md text-xs font-medium", s ? STATUS_CELL[s] : "bg-background text-muted-foreground")}
                  >
                    {d.slice(8)}
                    <span className="sr-only">{s ? s.replace("_", " ").toLowerCase() : "not marked"}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Green present · orange half day · red absent · grey leave / week off. Number is the date.</p>
          </>
        )}
      </section>

      <section className="mt-6" aria-label="Payroll history">
        <h2 className="mb-2 text-sm font-semibold">Payroll history</h2>
        {slips.length === 0 ? (
          <div className="rounded-lg border bg-surface">
            <EmptyState message="No payslips yet for this employee." />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-lg border bg-surface md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Monthly payslips</caption>
                <thead className="border-b bg-background text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Month</th>
                    {["Days", "Gross", "Advance", "PF", "ESI", "Deductions", "Net salary"].map((h) => (
                      <th key={h} className="px-3 py-2 text-right font-medium">{h}</th>
                    ))}
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {slips.map(({ p, period }) => (
                    <tr key={p.id} className="tabular border-b last:border-0">
                      <td className="px-3 py-2">{formatMonth(period)}</td>
                      <td className="px-3 py-2 text-right">{p.daysWorked}</td>
                      <td className="px-3 py-2 text-right">{formatINR(p.gross)}</td>
                      <td className="px-3 py-2 text-right">{formatINR(p.advanceRecovered)}</td>
                      <td className="px-3 py-2 text-right">{formatINR(p.epfEmployee)}</td>
                      <td className="px-3 py-2 text-right">{formatINR(p.esiEmployee)}</td>
                      <td className="px-3 py-2 text-right">{formatINR(p.totalDeductions)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatINR(p.net)}</td>
                      <td className="px-3 py-2"><StatusBadge status={p.paymentStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-2 md:hidden">
              {slips.map(({ p, period }) => (
                <li key={p.id} className="rounded-lg border bg-surface p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{formatMonth(period)}</p>
                    <StatusBadge status={p.paymentStatus} />
                  </div>
                  <p className="tabular mt-1 text-lg font-semibold">{formatINR(p.net)}</p>
                  <dl className="tabular mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between"><dt>Days</dt><dd>{p.daysWorked}</dd></div>
                    <div className="flex justify-between"><dt>Gross</dt><dd>{formatINR(p.gross)}</dd></div>
                    <div className="flex justify-between"><dt>Advance</dt><dd>{formatINR(p.advanceRecovered)}</dd></div>
                    <div className="flex justify-between"><dt>PF</dt><dd>{formatINR(p.epfEmployee)}</dd></div>
                    <div className="flex justify-between"><dt>ESI</dt><dd>{formatINR(p.esiEmployee)}</dd></div>
                    <div className="flex justify-between"><dt>Deductions</dt><dd>{formatINR(p.totalDeductions)}</dd></div>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
