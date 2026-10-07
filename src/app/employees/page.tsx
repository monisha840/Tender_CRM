"use client";

import { useMemo, useState } from "react";
import { IndianRupee, UserCheck, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { FilterSelect, allOption } from "@/components/workforce/filter-select";
import { WorkforceTabs } from "@/components/workforce/workforce-tabs";
import { formatDate } from "@/lib/dates";
import { formatINR, sumMoney } from "@/lib/money";
import { getDirectory, type DirectoryRow, type PayFilter } from "@/modules/workforce/queries";
import { useDb, useRegionFilter } from "@/store/hooks";

const PAY_OPTIONS: { value: PayFilter; label: string }[] = [
  { value: "PAID", label: "Paid" },
  { value: "PENDING", label: "Pending" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "NOT_ON_PAYROLL", label: "Not on payroll" },
];

const uniq = (values: string[]) => [...new Set(values)].sort().map((v) => ({ value: v, label: v }));

export default function EmployeesPage() {
  const db = useDb();
  const { region } = useRegionFilter();
  const [site, setSite] = useState("ALL");
  const [designation, setDesignation] = useState("ALL");
  const [department, setDepartment] = useState("ALL");
  const [pay, setPay] = useState("ALL");

  const all = useMemo(() => getDirectory(db, region), [db, region]);
  const sites = useMemo(() => {
    const ids = new Set(all.flatMap((r) => r.siteIds));
    return db.sites
      .filter((s) => ids.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ value: s.id, label: s.name }));
  }, [all, db.sites]);

  const rows = useMemo(
    () =>
      all.filter(
        (r) =>
          (site === "ALL" || r.siteIds.includes(site)) &&
          (designation === "ALL" || r.designation === designation) &&
          (department === "ALL" || r.department === department) &&
          (pay === "ALL" || r.payStatus === pay),
      ),
    [all, site, designation, department, pay],
  );

  const columns: DataTableColumn<DirectoryRow>[] = [
    { key: "code", header: "Code", cell: (r) => <span className="tabular text-muted-foreground">{r.code}</span>, sortValue: (r) => r.code },
    { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span>, sortValue: (r) => r.name, mobile: "title" },
    { key: "phone", header: "Phone", cell: (r) => <span className="tabular">{r.phone}</span> },
    { key: "site", header: "Site", cell: (r) => r.siteNames, sortValue: (r) => r.siteNames },
    { key: "designation", header: "Designation", cell: (r) => r.designation, sortValue: (r) => r.designation },
    { key: "department", header: "Department", cell: (r) => r.department, sortValue: (r) => r.department },
    { key: "joined", header: "Joined", cell: (r) => <span className="tabular">{formatDate(r.joiningDate)}</span>, sortValue: (r) => r.joiningDate },
    {
      key: "salary",
      header: "Salary",
      numeric: true,
      cell: (r) => (
        <span>
          {formatINR(r.wage)}
          {r.wageUnit === "day" && <span className="text-xs text-muted-foreground"> /day</span>}
        </span>
      ),
      sortValue: (r) => Number(r.wage),
    },
    { key: "advance", header: "Advance", numeric: true, cell: (r) => formatINR(r.advance), sortValue: (r) => Number(r.advance) },
    {
      key: "status",
      header: "Salary status",
      mobile: "badge",
      cell: (r) => (r.payStatus === "NOT_ON_PAYROLL" ? <StatusBadge status="NA" label="Not on payroll" /> : <StatusBadge status={r.payStatus} />),
      sortValue: (r) => r.payStatus,
    },
  ];

  const pendingCount = all.filter((r) => r.payStatus === "PENDING").length;
  const monthly = sumMoney(all.filter((r) => r.wageUnit === "month").map((r) => r.wage));

  return (
    <>
      <PageHeader title="Employees" description="Employee master with salary, advance and salary status for the latest payroll month." />
      <WorkforceTabs />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Employees" value={String(all.length)} icon={Users} hint={`${rows.length} shown`} />
        <KpiTile label="Monthly salary bill" value={formatINR(monthly, { compact: true })} icon={IndianRupee} hint="Monthly-paid staff" />
        <KpiTile label="Salary pending" value={String(pendingCount)} icon={Wallet} hint="employees, latest month" href="/employees/payroll" />
        <KpiTile label="Advance outstanding" value={formatINR(sumMoney(all.map((r) => r.advance)), { compact: true })} icon={UserCheck} />
      </div>
      <DataTable
        caption="Employees"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        getRowHref={(r) => `/employees/${r.id}`}
        search={{ placeholder: "Search name, code or phone", getText: (r) => `${r.name} ${r.code} ${r.phone}` }}
        emptyMessage="No employees match these filters."
        pageSize={30}
        toolbar={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <FilterSelect label="Filter by site" value={site} onChange={setSite} options={[allOption("All sites"), ...sites]} />
            <FilterSelect label="Filter by designation" value={designation} onChange={setDesignation} options={[allOption("All designations"), ...uniq(all.map((r) => r.designation))]} />
            <FilterSelect label="Filter by department" value={department} onChange={setDepartment} options={[allOption("All departments"), ...uniq(all.map((r) => r.department))]} />
            <FilterSelect label="Filter by salary status" value={pay} onChange={setPay} options={[allOption("All salary status"), ...PAY_OPTIONS]} />
          </div>
        }
      />
    </>
  );
}
