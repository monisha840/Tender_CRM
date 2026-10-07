// Server-only. Prisma -> `Database` slice for employees, attendance and payroll.
// See row-mapper.ts for the Decimal/Date conversion and soft-delete conventions.
import type { PrismaClient } from "@prisma/client";
import type {
  Attendance,
  Database,
  Employee,
  EmployeeProfile,
  LabourType,
  PayrollRun,
  Payslip,
  SiteAssignment,
} from "@/types";
import { byProject, byRegion, live, mapRow, type LoadScope, type RowSpec } from "./row-mapper";

export type WorkforceSlice = Pick<
  Database,
  "employees" | "employeeProfiles" | "labourTypes" | "attendance" | "payrollRuns" | "payslips" | "siteAssignments"
>;

export const employeeSpec: RowSpec = { str: ["code", "name", "phone", "homeRegionId", "userId"], optional: ["phone", "userId"] };
export const labourTypeSpec: RowSpec = { str: ["name", "payrollMode"], bool: ["isActive"] };
export const employeeProfileSpec: RowSpec = {
  str: ["employeeId", "designation", "department", "labourTypeId", "uan", "contractorId"],
  bool: ["pfApplicable", "esiApplicable"],
  money: ["wageAmount", "advanceBalance"],
  date: ["joiningDate", "exitDate"],
  optional: ["exitDate", "uan", "contractorId"],
};
export const siteAssignmentSpec: RowSpec = {
  str: ["employeeId", "siteId", "projectId", "role", "reason", "assignedById"],
  date: ["fromDate", "toDate"],
  optional: ["toDate", "reason"],
};
/** dayFraction is a JS number (1, 0.5, 0), per the Attendance type. */
export const attendanceSpec: RowSpec = {
  str: ["employeeId", "siteId", "projectId", "regionId", "status", "source", "markedById", "clientUuid"],
  int: ["overtimeMinutes"],
  num: ["dayFraction"],
  date: ["date"],
};
export const payrollRunSpec: RowSpec = {
  str: ["periodMonth", "regionId", "status", "approvalRequestId"],
  int: ["employeeCount"],
  money: ["grossTotal", "epfEmployeeTotal", "epfEmployerTotal", "netTotal"],
  ts: ["lockedAt"],
  optional: ["lockedAt", "approvalRequestId"],
};
/** daysWorked is a JS number per the Payslip type. */
export const payslipSpec: RowSpec = {
  str: ["payrollRunId", "employeeId", "paymentStatus"],
  num: ["daysWorked"],
  money: ["overtimeAmount", "gross", "epfWages", "epfEmployee", "epfEmployer", "advanceRecovered", "esiEmployee", "esiEmployer", "otherDeductions", "totalDeductions", "net"],
  date: ["paidOn"],
  optional: ["paidOn"],
};

const rows = <T>(list: unknown[], spec: RowSpec): T[] => list.map((r) => mapRow<T>(r as Record<string, unknown>, spec));

/**
 * Loads the workforce slice (soft-deleted rows excluded). Region scope applies to employees (home region),
 * attendance and payroll runs; profiles and payslips follow the employees/runs loaded. Project scope narrows
 * attendance and site assignments.
 */
export async function loadWorkforce(prisma: PrismaClient, scope?: LoadScope): Promise<Partial<Database>> {
  const employees = await prisma.employee.findMany({
    where: { ...live, ...(scope?.regionIds ? { homeRegionId: { in: scope.regionIds } } : {}) },
    orderBy: { code: "asc" },
  });
  const [profiles, labourTypes, attendance, runs, assignments] = await Promise.all([
    prisma.employeeProfile.findMany({ where: { ...live, employeeId: { in: employees.map((e) => e.id) } } }),
    prisma.labourType.findMany({ where: { ...live }, orderBy: { name: "asc" } }),
    prisma.attendance.findMany({ where: { ...live, ...byRegion(scope), ...byProject(scope) }, orderBy: { date: "asc" } }),
    prisma.payrollRun.findMany({ where: { ...live, ...byRegion(scope) }, orderBy: { periodMonth: "asc" } }),
    prisma.siteAssignment.findMany({ where: { ...live, ...byProject(scope) }, orderBy: { fromDate: "asc" } }),
  ]);
  const payslips = await prisma.payslip.findMany({ where: { ...live, payrollRunId: { in: runs.map((r) => r.id) } } });
  const slice: WorkforceSlice = {
    employees: rows<Employee>(employees, employeeSpec),
    employeeProfiles: rows<EmployeeProfile>(profiles, employeeProfileSpec),
    labourTypes: rows<LabourType>(labourTypes, labourTypeSpec),
    attendance: rows<Attendance>(attendance, attendanceSpec),
    payrollRuns: rows<PayrollRun>(runs, payrollRunSpec),
    payslips: rows<Payslip>(payslips, payslipSpec),
    siteAssignments: rows<SiteAssignment>(assignments, siteAssignmentSpec),
  };
  return slice;
}
