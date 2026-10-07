import { addDays, dayOfWeek, DEMO_TODAY, lastNDays } from "@/lib/dates";
import type { AttendanceStatus } from "@/types";
import { isEsiEligible } from "@/lib/payroll-rules";
import { OFFICE_STAFF, PROJECT_SPECS, SITES } from "./catalog";
import { meta, RegionKey, rupees, type RegionKeyName, type SeedCtx } from "./helpers";
import { employeeIdOfUser, USER_SPECS, userId } from "./org";
import type { ProjectInfo } from "./projects";

const FIRST: Record<RegionKeyName, string[]> = {
  cg: ["Ravi", "Mahesh", "Ajay", "Kamlesh", "Hemant", "Tikeshwar", "Bhupendra", "Lokesh", "Umesh", "Yogesh", "Narendra", "Dinesh", "Jitendra", "Rakesh"],
  mh: ["Vishal", "Amol", "Pravin", "Nilesh", "Sagar", "Mangesh", "Ashok", "Rohan", "Tushar", "Akash"],
  south: ["Arumugam", "Selvam", "Vignesh", "Prakash", "Saravanan", "Ganesan", "Venkatesh", "Mani", "Rajesh", "Karthik", "Basavaraj", "Shivu"],
  delhi: ["Rahul", "Sunil", "Manoj", "Vijay", "Arjun", "Naveen", "Sachin", "Amit", "Pradeep", "Harish"],
};
const LAST: Record<RegionKeyName, string[]> = {
  cg: ["Sahu", "Netam", "Yadav", "Dewangan", "Chandrakar", "Verma", "Patel", "Kanwar", "Markam", "Tandon"],
  mh: ["Patil", "Jadhav", "Shinde", "Pawar", "Kale", "Gaikwad", "Bhosale", "Kadam"],
  south: ["Murugesan", "Palanisamy", "Subramani", "Pillai", "Nadar", "Gounder", "Reddy", "Naik", "Shetty", "Rathinam"],
  delhi: ["Kumar", "Singh", "Sharma", "Gupta", "Mishra", "Chauhan", "Tomar", "Rawat", "Mondal", "Sahoo", "Pandey"],
};

/** Salary by role for the persona employees (0 = not on payroll, e.g. directors). */
const STAFF_WAGE: Record<string, number> = {
  director: 0, tender_exec: 48000, regional_head: 95000, accounts: 52000, legal_admin: 55000, project_manager: 82000, site_engineer: 50000, supervisor: 30000,
};
const DESIGNATION: Record<string, string> = {
  director: "Director", tender_exec: "Tender Executive", regional_head: "Regional Head", accounts: "Accounts Manager",
  legal_admin: "Legal & Admin Officer", project_manager: "Project Manager", site_engineer: "Site Engineer", supervisor: "Supervisor",
};

const DEPARTMENT: Record<string, string> = {
  director: "Management", tender_exec: "Tenders & Contracts", regional_head: "Regional Operations", accounts: "Accounts & Finance",
  legal_admin: "Legal & Admin", project_manager: "Projects", site_engineer: "Site Operations", supervisor: "Site Operations",
};

/** Persona users acting as site engineer / supervisor in a region (used as `markedBy`, `submittedBy`). */
export const SITE_USER: Record<RegionKeyName, { engineer: string; supervisor: string }> = {
  cg: { engineer: userId("se_cg"), supervisor: userId("sup_cg") },
  mh: { engineer: userId("se_mh"), supervisor: userId("sup_mh") },
  south: { engineer: userId("se_south"), supervisor: userId("sup_south") },
  delhi: { engineer: userId("se_delhi"), supervisor: userId("sup_delhi") },
};

/** ESI applies when monthly gross is at most ₹21,000 (a payroll rule that will move to settings). */

export function seedWorkforce(ctx: SeedCtx, projects: ProjectInfo[]) {
  const { db, rng } = ctx;
  let empNo = USER_SPECS.length;
  const nextCode = () => `SPH-${String(++empNo).padStart(3, "0")}`;
  const nameCounter: Record<RegionKeyName, number> = { cg: 0, mh: 0, south: 0, delhi: 0 };
  const nextName = (r: RegionKeyName) => {
    const i = nameCounter[r]++;
    return `${FIRST[r][i % FIRST[r].length]} ${LAST[r][(i * 3 + 1) % LAST[r].length]}`;
  };
  const uan = () => `1012${rng.int(10000000, 99999999)}`;

  USER_SPECS.forEach((u) => {
    const wage = STAFF_WAGE[u.role] ?? 0;
    db.employeeProfiles.push({
      ...meta(`ep_${u.key}`), employeeId: employeeIdOfUser(u.key), designation: u.title ?? DESIGNATION[u.role], department: DEPARTMENT[u.role], labourTypeId: "lt_monthly",
      joiningDate: "2019-04-01", exitDate: null, wageAmount: rupees(wage), pfApplicable: wage > 0, esiApplicable: wage > 0 && isEsiEligible(wage, DEMO_TODAY),
      advanceBalance: rupees(0), uan: wage ? uan() : null, contractorId: null,
    });
  });

  const addEmployee = (id: string, name: string, region: RegionKeyName, designation: string, department: string, mode: "MONTHLY" | "DAILY", wage: number, joined: string) => {
    const monthlyEquivalent = mode === "DAILY" ? wage * 26 : wage;
    const hasAdvance = mode === "DAILY" && rng.chance(0.22);
    db.employees.push({ ...meta(id), code: nextCode(), name, phone: `9${rng.int(100000000, 999999999)}`, homeRegionId: RegionKey[region], userId: null });
    db.employeeProfiles.push({
      ...meta(`ep_${id}`), employeeId: id, designation, department, labourTypeId: mode === "DAILY" ? "lt_daily" : "lt_monthly", joiningDate: joined, exitDate: null,
      wageAmount: rupees(wage), pfApplicable: true, esiApplicable: isEsiEligible(monthlyEquivalent, DEMO_TODAY),
      advanceBalance: rupees(hasAdvance ? rng.pick([2000, 3000, 5000, 8000, 10000]) : 0), uan: uan(), contractorId: null,
    });
  };

  OFFICE_STAFF.forEach((o) => addEmployee(o.id, o.name, o.region, o.designation, o.department, "MONTHLY", o.wage, "2021-06-01"));

  const infoOf = (key: string) => projects.find((p) => p.key === key)!;
  const assign = (employeeId: string, role: string, projectKey: string, from: string, to: string | null = null, reason: string | null = null) => {
    const proj = infoOf(projectKey);
    db.siteAssignments.push({
      ...meta(`sa_${employeeId}_${projectKey}`), employeeId, siteId: proj.siteId, projectId: proj.id, role, fromDate: from, toDate: to, reason,
      assignedById: employeeIdOfUser(proj.pmKey),
    });
  };

  PROJECT_SPECS.filter((spec) => !spec.completed).forEach((spec) => {
    const proj = infoOf(spec.key);
    const region = proj.regionKey;
    const engineerEmp = spec.engineer ?? `emp_se_${spec.key}`;
    const supervisorEmp = spec.supervisor ?? `emp_sup_${spec.key}`;
    if (!spec.engineer) addEmployee(engineerEmp, nextName(region), region, "Site Engineer", "Site Operations", "MONTHLY", rng.pick([42000, 46000, 50000, 54000]), "2022-06-15");
    if (!spec.supervisor) addEmployee(supervisorEmp, nextName(region), region, "Supervisor", "Site Operations", "MONTHLY", rng.pick([26000, 28000, 30000, 32000]), "2022-09-01");
    assign(engineerEmp, "Site Engineer", spec.key, proj.startDate);
    assign(supervisorEmp, "Supervisor", spec.key, proj.startDate);

    for (let n = 1; n <= spec.workers.count; n++) {
      const id = `emp_w_${spec.key}_${n}`;
      const role = spec.workers.roles[(n - 1) % spec.workers.roles.length];
      addEmployee(id, nextName(region), region, role, "Site Operations", "DAILY", spec.workers.wage + rng.pick([0, 20, 40, 60]), "2023-02-01");
      assign(id, role, spec.key, proj.startDate);
    }
  });

  // Two transfers between plants (assignment history is the transfer log).
  const transfer = (employeeId: string, fromProject: string, toProject: string, daysAgo: number) => {
    const current = db.siteAssignments.find((a) => a.employeeId === employeeId && a.projectId === infoOf(toProject).id)!;
    const from = infoOf(fromProject);
    db.siteAssignments.push({
      ...meta(`sa_${employeeId}_${fromProject}`), employeeId, siteId: from.siteId, projectId: from.id, role: current.role, fromDate: current.fromDate,
      toDate: addDays(DEMO_TODAY, -daysAgo - 1), reason: "Transferred to another plant", assignedById: current.assignedById,
    });
    current.fromDate = addDays(DEMO_TODAY, -daysAgo);
    current.reason = "Transferred from another plant";
  };
  transfer("emp_w_p6_ntpc_steel_1", "p2_cspgcl_paint", "p6_ntpc_steel", 40);
  transfer("emp_w_p10_kpcl_pkg_1", "p5_tangedco_scaff", "p10_kpcl_pkg", 30);

  // ---- Attendance: from 1 April (190 days to the demo date), current assignments only ----
  const siteRegion = new Map(SITES.map((s) => [s.id, s.region]));
  const current = db.siteAssignments.filter((a) => !a.toDate || a.toDate >= DEMO_TODAY);
  lastNDays(190).forEach((date) => {
    const sunday = dayOffsetIsSunday(date);
    current.forEach((a) => {
      if (date < a.fromDate) return;
      // The supervisor at TANGEDCO Mettur has not marked today yet.
      if (date === DEMO_TODAY && a.projectId === "prj_p5_tangedco_scaff") return;
      const region = siteRegion.get(a.siteId)!;
      let status: AttendanceStatus;
      let fraction = 1;
      if (sunday) {
        status = "WEEKOFF";
        fraction = 0;
      } else {
        const r = rng.next();
        if (r < 0.86) status = "PRESENT";
        else if (r < 0.9) { status = "HALF_DAY"; fraction = 0.5; }
        else if (r < 0.96) { status = "ABSENT"; fraction = 0; }
        else { status = "LEAVE"; fraction = 0; }
      }
      db.attendance.push({
        ...meta(`att_${a.employeeId}_${date}`), employeeId: a.employeeId, siteId: a.siteId, projectId: a.projectId, regionId: RegionKey[region], date, status,
        dayFraction: fraction, overtimeMinutes: status === "PRESENT" && a.role !== "Site Engineer" && a.role !== "Supervisor" && rng.chance(0.2) ? rng.pick([60, 90, 120, 180]) : 0,
        source: "SUPERVISOR", markedById: SITE_USER[region].supervisor, clientUuid: `att-${a.employeeId}-${date}`,
      });
    });
  });
}

const dayOffsetIsSunday = (date: string) => dayOfWeek(date) === 0;
