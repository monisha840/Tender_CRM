"use client";

import { useMemo, useState } from "react";
import { Banknote, CircleDollarSign, HandCoins, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { FilterSelect, allOption } from "@/components/workforce/filter-select";
import { WorkforceTabs } from "@/components/workforce/workforce-tabs";
import { ImportExport } from "@/components/data/import-export";
import { PfBanner } from "@/components/workforce/pf-banner";
import { getPfStatus, listEmployeePay, listPayrollPeriods, type EmployeePayRow } from "@/lib/data";
import { formatMonth } from "@/lib/dates";
import { formatINR, sumMoney } from "@/lib/money";
import { useDb, useRegionFilter } from "@/store/hooks";

const STATUS_OPTIONS = [
  { value: "PAID", label: "Paid" },
  { value: "PENDING", label: "Pending" },
  { value: "ON_HOLD", label: "On hold" },
];

export default function PayrollPage() {
  const db = useDb();
  const { region } = useRegionFilter();
  const periods = useMemo(() => listPayrollPeriods(db), [db]);
  const [period, setPeriod] = useState(periods[0] ?? "");
  const [status, setStatus] = useState("ALL");

  // Directors and others without a payslip are not on payroll for the month.
  const all = useMemo(() => listEmployeePay(db, period, region).filter((r) => r.payslip), [db, period, region]);
  const rows = useMemo(() => all.filter((r) => status === "ALL" || r.payslip!.paymentStatus === status), [all, status]);
  const siteOf = useMemo(() => {
    const m = new Map<string, string>();
    db.siteAssignments.filter((a) => !a.toDate).forEach((a) => m.set(a.employeeId, db.sites.find((s) => s.id === a.siteId)?.name ?? "—"));
    return m;
  }, [db]);

  const pf = useMemo(() => getPfStatus(db, region), [db, region]);
  const slips = all.map((r) => r.payslip!);
  const dayRate = (r: EmployeePayRow) => db.labourTypes.find((l) => l.id === r.profile.labourTypeId)?.payrollMode === "DAILY";

  const columns: DataTableColumn<EmployeePayRow>[] = [
    { key: "code", header: "Code", cell: (r) => <span className="tabular text-muted-foreground">{r.employee.code}</span>, sortValue: (r) => r.employee.code },
    { key: "name", header: "Name", mobile: "title", cell: (r) => <span className="font-medium">{r.employee.name}</span>, sortValue: (r) => r.employee.name },
    { key: "site", header: "Site", cell: (r) => siteOf.get(r.employee.id) ?? "Office", sortValue: (r) => siteOf.get(r.employee.id) ?? "" },
    {
      key: "salary",
      header: "Salary",
      numeric: true,
      cell: (r) => (
        <span>
          {formatINR(r.profile.wageAmount)}
          {dayRate(r) && <span className="text-xs text-muted-foreground"> /day</span>}
        </span>
      ),
      sortValue: (r) => Number(r.profile.wageAmount),
    },
    { key: "days", header: "Days", numeric: true, cell: (r) => r.payslip!.daysWorked, sortValue: (r) => Number(r.payslip!.daysWorked) },
    { key: "gross", header: "Gross", numeric: true, cell: (r) => formatINR(r.payslip!.gross), sortValue: (r) => Number(r.payslip!.gross) },
    { key: "advance", header: "Advance", numeric: true, cell: (r) => formatINR(r.payslip!.advanceRecovered), sortValue: (r) => Number(r.payslip!.advanceRecovered) },
    { key: "pf", header: "PF", numeric: true, cell: (r) => formatINR(r.payslip!.epfEmployee), sortValue: (r) => Number(r.payslip!.epfEmployee) },
    { key: "esi", header: "ESI", numeric: true, cell: (r) => formatINR(r.payslip!.esiEmployee), sortValue: (r) => Number(r.payslip!.esiEmployee) },
    { key: "ded", header: "Deductions", numeric: true, cell: (r) => formatINR(r.payslip!.totalDeductions), sortValue: (r) => Number(r.payslip!.totalDeductions) },
    { key: "net", header: "Net salary", numeric: true, cell: (r) => <span className="font-semibold">{formatINR(r.payslip!.net)}</span>, sortValue: (r) => Number(r.payslip!.net) },
    { key: "status", header: "Status", mobile: "badge", cell: (r) => <StatusBadge status={r.payslip!.paymentStatus} />, sortValue: (r) => r.payslip!.paymentStatus },
  ];

  const headers = ["code", "name", "site", "salary", "days", "gross", "advance recovered", "pf employee", "pf employer", "esi employee", "deductions", "net", "status"];
  const exportRows = rows.map((r) => {
    const p = r.payslip!;
    return [r.employee.code, r.employee.name, siteOf.get(r.employee.id) ?? "Office", r.profile.wageAmount, p.daysWorked, p.gross, p.advanceRecovered, p.epfEmployee, p.epfEmployer, p.esiEmployee, p.totalDeductions, p.net, p.paymentStatus];
  });

  return (
    <>
      <PageHeader
        title="Payroll"
        description={`Monthly payroll for ${period ? formatMonth(period) : "—"}: salary, attendance days, advance, deductions, PF, ESI and net salary.`}
        primaryAction={{ label: "Payroll dashboard", href: "/employees/payroll/dashboard" }}
      />
      <WorkforceTabs />
      <PfBanner pf={pf} href="/employees/payroll/dashboard" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="On payroll" value={String(all.length)} icon={Users} />
        <KpiTile label="Gross" value={formatINR(sumMoney(slips.map((s) => s.gross)), { compact: true })} icon={Banknote} />
        <KpiTile label="PF + ESI (employee)" value={formatINR(sumMoney(slips.flatMap((s) => [s.epfEmployee, s.esiEmployee])), { compact: true })} icon={HandCoins} />
        <KpiTile label="Net salary" value={formatINR(sumMoney(slips.map((s) => s.net)), { compact: true })} icon={CircleDollarSign} />
      </div>
      <ImportExport filename={`payroll-${period}`} headers={headers} rows={exportRows} />
      <DataTable
        getRowTone={(r) => (r.payslip!.paymentStatus === "ON_HOLD" ? "danger" : r.payslip!.paymentStatus === "PENDING" ? "warning" : undefined)}
        caption={`Payroll ${period}`}
        rows={rows}
        columns={columns}
        getRowId={(r) => r.employee.id}
        getRowHref={(r) => `/employees/${r.employee.id}`}
        search={{ placeholder: "Search name or code", getText: (r) => `${r.employee.name} ${r.employee.code}` }}
        emptyMessage="No payslips match these filters."
        pageSize={30}
        toolbar={
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <FilterSelect label="Payroll month" value={period} onChange={setPeriod} options={periods.map((p) => ({ value: p, label: formatMonth(p) }))} />
            <FilterSelect label="Payment status" value={status} onChange={setStatus} options={[allOption("All statuses"), ...STATUS_OPTIONS]} />
          </div>
        }
      />
    </>
  );
}
