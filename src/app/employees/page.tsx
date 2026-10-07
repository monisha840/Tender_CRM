"use client";

import { useMemo, useState } from "react";
import { IndianRupee, UserCheck, UserPlus, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ImportExport } from "@/components/data/import-export";
import { RecordForm, type FormField } from "@/components/data/record-form";
import { buildEmployee, nextEmployeeCode, type EmployeeEntry } from "@/modules/workforce/entry";
import { useDataStore } from "@/store/data-store";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { FilterSelect, allOption } from "@/components/workforce/filter-select";
import { WorkforceTabs } from "@/components/workforce/workforce-tabs";
import { formatDate, getToday } from "@/lib/dates";
import { formatINR, sumMoney } from "@/lib/money";
import { getDirectory, type DirectoryRow, type PayFilter } from "@/modules/workforce/queries";
import { useUrlParam } from "@/lib/use-url-param";
import { useCurrentPersona, useDb, useRegionFilter } from "@/store/hooks";
import type { Database } from "@/types";

const PAY_OPTIONS: { value: PayFilter; label: string }[] = [
  { value: "PAID", label: "Paid" },
  { value: "PENDING", label: "Pending" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "NOT_ON_PAYROLL", label: "Not on payroll" },
];

const uniq = (values: string[]) => [...new Set(values)].sort().map((v) => ({ value: v, label: v }));

const PAY_LABEL: Record<string, string> = { PAID: "Paid", PENDING: "Pending", ON_HOLD: "On hold", NOT_ON_PAYROLL: "Not on payroll" };

const HEADERS = ["code", "name", "phone", "site", "designation", "department", "labour type", "joining date", "wage", "advance", "salary status (export only)", "region", "pf", "esi", "uan"];

function entryFromRecord(r: Record<string, string>): EmployeeEntry {
  return {
    code: r["code"], name: r["name"], phone: r["phone"], site: r["site"], designation: r["designation"], department: r["department"],
    labourType: r["labour type"], joiningDate: r["joining date"], wage: r["wage"], advance: r["advance"], region: r["region"],
    pf: r["pf"], esi: r["esi"], uan: r["uan"],
  };
}

function employeeFields(db: Database): FormField[] {
  const regions = db.regions.filter((r) => r.isActive);
  return [
    { name: "name", label: "Full name", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "code", label: "Employee code", required: true, defaultValue: nextEmployeeCode(db), hint: "Next free code suggested." },
    { name: "region", label: "Home region", type: "select", required: true, options: regions.map((r) => ({ value: r.id, label: r.name })) },
    { name: "designation", label: "Designation", required: true },
    { name: "department", label: "Department", defaultValue: "Site Operations" },
    {
      name: "labourType", label: "Labour type", type: "select", required: true,
      options: db.labourTypes.filter((l) => l.isActive).map((l) => ({ value: l.id, label: `${l.name} (${l.payrollMode === "DAILY" ? "daily rate" : l.payrollMode === "MONTHLY" ? "monthly salary" : "paid via contractor"})` })),
    },
    { name: "wage", label: "Wage amount (₹)", type: "number", required: true, hint: "Monthly salary for monthly staff, daily rate for daily workers." },
    { name: "joiningDate", label: "Joining date", type: "date", required: true, defaultValue: getToday() },
    { name: "pf", label: "PF applicable", type: "select", required: true, options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
    { name: "esi", label: "ESI applicable", type: "select", required: true, defaultValue: "no", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
    { name: "uan", label: "UAN (optional)" },
    { name: "advance", label: "Opening advance (₹)", type: "number", defaultValue: "0" },
    { name: "site", label: "Plant site (optional)", type: "select", options: db.sites.filter((s) => !s.deletedAt).sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ value: s.id, label: s.name })) },
  ];
}

export default function EmployeesPage() {
  const db = useDb();
  const upsert = useDataStore((s) => s.upsert);
  const persona = useCurrentPersona();
  const [adding, setAdding] = useState(false);

  const save = (entry: EmployeeEntry, takenCodes?: Set<string>) => {
    const res = buildEmployee(useDataStore.getState().db, entry, { userId: persona.user.id, takenCodes });
    if ("error" in res) return res.error;
    takenCodes?.add(res.rows.employee.code);
    upsert("employees", res.rows.employee);
    upsert("employeeProfiles", res.rows.profile);
    if (res.rows.assignment) upsert("siteAssignments", res.rows.assignment);
    return undefined;
  };
  const importRecords = (records: Record<string, string>[]) => {
    const taken = new Set<string>();
    const errors: string[] = [];
    let imported = 0;
    records.forEach((r, i) => {
      const err = save(entryFromRecord(r), taken);
      if (err) errors.push(`Row ${i + 2}: ${err}`);
      else imported++;
    });
    return { imported, errors };
  };
  const { region } = useRegionFilter();
  const [site, setSite] = useState("ALL");
  const [designation, setDesignation] = useState("ALL");
  const [department, setDepartment] = useState("ALL");
  const [payPick, setPay] = useState<string | null>(null);
  const salaryParam = useUrlParam("salary");
  const pay = payPick ?? (salaryParam === "pending" ? "PENDING" : salaryParam === "on-hold" ? "ON_HOLD" : "ALL");

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
    {
      key: "name",
      header: "Employee",
      cell: (r) => (
        <span className="block min-w-40">
          <span className="block font-medium">{r.name}</span>
          <span className="tabular block text-xs whitespace-nowrap text-muted-foreground">{r.code}</span>
        </span>
      ),
      sortValue: (r) => r.name,
      mobile: "title",
    },
    { key: "phone", header: "Phone", cell: (r) => <span className="tabular whitespace-nowrap">{r.phone}</span> },
    { key: "site", header: "Site", cell: (r) => <span className="block max-w-40 truncate" title={r.siteNames}>{r.siteNames}</span>, sortValue: (r) => r.siteNames },
    {
      key: "designation",
      header: "Role",
      cell: (r) => (
        <span className="block min-w-36">
          <span className="block">{r.designation}</span>
          <span className="block text-xs text-muted-foreground">{r.department}</span>
        </span>
      ),
      sortValue: (r) => r.designation,
    },
    { key: "joined", header: "Joined", cell: (r) => <span className="tabular whitespace-nowrap">{formatDate(r.joiningDate)}</span>, sortValue: (r) => r.joiningDate },
    {
      key: "salary",
      header: "Salary",
      numeric: true,
      cell: (r) => (
        <span className="whitespace-nowrap">
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
  const tone = (r: DirectoryRow) => (r.payStatus === "ON_HOLD" ? ("danger" as const) : r.payStatus === "PENDING" ? ("warning" as const) : undefined);
  const exportRows = rows.map((r) => {
    const p = db.employeeProfiles.find((x) => x.employeeId === r.id);
    return [
      r.code, r.name, r.phone === "—" ? "" : r.phone, r.siteNames, r.designation, r.department, r.labourType, formatDate(r.joiningDate), r.wage, r.advance,
      PAY_LABEL[r.payStatus], r.regionName, p?.pfApplicable ? "yes" : "no", p?.esiApplicable ? "yes" : "no", p?.uan ?? "",
    ];
  });

  const pendingCount = all.filter((r) => r.payStatus === "PENDING").length;
  const monthly = sumMoney(all.filter((r) => r.wageUnit === "month").map((r) => r.wage));

  return (
    <>
      <PageHeader
        title="Employees"
        description="Employee master with salary, advance and salary status for the latest payroll month."
        primaryAction={{ label: "Add employee", icon: UserPlus, onClick: () => setAdding(true) }}
      />
      <WorkforceTabs />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Employees" value={String(all.length)} icon={Users} hint={`${rows.length} shown`} />
        <KpiTile label="Monthly salary bill" value={formatINR(monthly, { compact: true })} icon={IndianRupee} hint="Monthly-paid staff" />
        <KpiTile label="Salary pending" value={String(pendingCount)} icon={Wallet} hint="employees, latest month" href="/employees/payroll" />
        <KpiTile label="Advance outstanding" value={formatINR(sumMoney(all.map((r) => r.advance)), { compact: true })} icon={UserCheck} />
      </div>
      <ImportExport filename="employees" headers={HEADERS} rows={exportRows} onImport={importRecords} />
      <RecordForm
        key={adding ? "open" : "closed"}
        open={adding}
        onOpenChange={setAdding}
        title="Add employee"
        description="Creates the employee, wage profile and site assignment."
        submitLabel="Add employee"
        fields={employeeFields(db)}
        onSubmit={(v) => {
          const err = save({ ...v });
          if (!err) toast.success(`${v.name} added`);
          return err;
        }}
      />
      <DataTable
        getRowTone={tone}
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
