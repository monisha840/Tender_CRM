import { addDays, dayOfWeek, DEMO_TODAY, lastNDays } from "@/lib/dates";
import { rupees } from "./helpers";
import { USER_SPECS, employeeIdOfUser, userId } from "./org";
import { SITE_DEFS, type ProjectInfo } from "./projects";
import { meta, RegionKey, type RegionKeyName, type SeedCtx } from "./helpers";
import type { AttendanceStatus } from "@/types";

const FIRST: Record<RegionKeyName, string[]> = {
  korba: ["Ravi", "Mahesh", "Ajay", "Kamlesh", "Hemant", "Tikeshwar", "Bhupendra", "Lokesh", "Umesh", "Yogesh", "Narendra", "Dinesh", "Jitendra", "Rakesh"],
  delhi: ["Rahul", "Sunil", "Manoj", "Vijay", "Arjun", "Naveen", "Sachin", "Amit", "Pradeep", "Harish"],
  mh: ["Vishal", "Amol", "Pravin", "Nilesh", "Sagar", "Mangesh", "Ashok", "Rohan", "Tushar", "Akash"],
};
const LAST: Record<RegionKeyName, string[]> = {
  korba: ["Sahu", "Netam", "Yadav", "Dewangan", "Chandrakar", "Verma", "Patel", "Kanwar", "Markam", "Tandon"],
  delhi: ["Kumar", "Singh", "Sharma", "Gupta", "Mishra", "Chauhan", "Tomar", "Rawat"],
  mh: ["Patil", "Jadhav", "Shinde", "Pawar", "Kale", "Gaikwad", "Bhosale", "Kadam"],
};

/** Monthly salary by role for the persona employees (0 = not on payroll). */
const STAFF_WAGE: Record<string, number> = {
  director: 0, tender_exec: 45000, regional_head: 95000, accounts: 42000, legal_admin: 50000,
  project_manager: 78000, site_engineer: 48000, supervisor: 28000,
};
const DESIGNATION: Record<string, string> = {
  director: "Director", tender_exec: "Tender Executive", regional_head: "Regional Head", accounts: "Accounts Manager",
  legal_admin: "Legal & Admin Officer", project_manager: "Project Manager", site_engineer: "Site Engineer", supervisor: "Supervisor",
};

/** Persona user acting as supervisor/engineer in a region (used as `markedBy` etc.). */
export const SITE_USER: Record<RegionKeyName, { engineer: string; supervisor: string }> = {
  korba: { engineer: userId("se_korba"), supervisor: userId("sup_korba") },
  delhi: { engineer: userId("se_delhi"), supervisor: userId("sup_delhi") },
  mh: { engineer: userId("se_mh"), supervisor: userId("sup_mh") },
};

export function seedWorkforce(ctx: SeedCtx, projects: ProjectInfo[]) {
  const { db, rng } = ctx;
  let empNo = USER_SPECS.length;
  const nextCode = () => `EMP-${String(++empNo).padStart(3, "0")}`;
  const nameCounter: Record<RegionKeyName, number> = { korba: 0, delhi: 0, mh: 0 };
  const nextName = (r: RegionKeyName) => {
    const i = nameCounter[r]++;
    return `${FIRST[r][i % FIRST[r].length]} ${LAST[r][(i * 3 + 1) % LAST[r].length]}`;
  };
  const uan = () => `1012${rng.int(10000000, 99999999)}`;

  // Persona employees get a workforce profile.
  USER_SPECS.forEach((u) => {
    db.employeeProfiles.push({
      ...meta(`ep_${u.key}`),
      employeeId: employeeIdOfUser(u.key),
      designation: DESIGNATION[u.role],
      labourTypeId: "lt_monthly",
      joiningDate: "2021-04-01",
      exitDate: null,
      wageAmount: rupees(STAFF_WAGE[u.role] ?? 0),
      uan: STAFF_WAGE[u.role] ? uan() : null,
      contractorId: null,
    });
  });

  const addEmployee = (id: string, name: string, region: RegionKeyName, designation: string, mode: "MONTHLY" | "DAILY", wage: number, joined: string) => {
    db.employees.push({ ...meta(id), code: nextCode(), name, phone: `9${rng.int(100000000, 999999999)}`, homeRegionId: RegionKey[region], userId: null });
    db.employeeProfiles.push({
      ...meta(`ep_${id}`), employeeId: id, designation, labourTypeId: mode === "DAILY" ? "lt_daily" : "lt_monthly",
      joiningDate: joined, exitDate: null, wageAmount: rupees(wage), uan: uan(), contractorId: null,
    });
  };

  const projectOf = (key: string) => projects.find((p) => p.key === key)!;

  SITE_DEFS.forEach((site) => {
    const proj = projectOf(site.projectKey);
    const region = proj.regionKey;
    const fromDate = proj.startDate;
    const isPersonaEng = db.employees.some((e) => e.id === site.engineerEmp);
    const isPersonaSup = db.employees.some((e) => e.id === site.supervisorEmp);
    if (!isPersonaEng) addEmployee(site.engineerEmp, nextName(region), region, "Site Engineer", "MONTHLY", rng.pick([42000, 45000, 48000, 52000]), "2022-06-15");
    if (!isPersonaSup) addEmployee(site.supervisorEmp, nextName(region), region, "Supervisor", "MONTHLY", rng.pick([26000, 28000, 30000]), "2022-09-01");

    const workerIds: string[] = [];
    for (let n = 1; n <= site.workers; n++) {
      const id = `emp_w_${site.id}_${n}`;
      workerIds.push(id);
      addEmployee(id, nextName(region), region, rng.pick(["Mason", "Helper", "Bar bender", "Machine operator", "Carpenter"]), "DAILY", site.dailyWage + rng.pick([0, 20, 40, 60]), "2023-02-01");
    }

    const assign = (employeeId: string, role: string, siteId = site.id, from = fromDate, to: string | null = null, reason: string | null = null) =>
      db.siteAssignments.push({
        ...meta(`sa_${employeeId}_${siteId}`),
        employeeId, siteId, projectId: proj.id, role, fromDate: from, toDate: to, reason,
        assignedById: employeeIdOfUser(proj.pmKey),
      });
    assign(site.engineerEmp, "Site Engineer");
    assign(site.supervisorEmp, "Supervisor");
    workerIds.forEach((w) => assign(w, "Worker"));
  });

  // Two transfers between sites (assignment history is the transfer log).
  const transfer = (employeeId: string, fromSite: string, toSite: string, daysAgo: number) => {
    const old = db.siteAssignments.find((a) => a.employeeId === employeeId && a.siteId === toSite)!;
    const projFrom = db.sites.find((s) => s.id === fromSite)!.projectId;
    db.siteAssignments.push({
      ...meta(`sa_${employeeId}_${fromSite}`), employeeId, siteId: fromSite, projectId: projFrom, role: "Worker",
      fromDate: old.fromDate, toDate: addDays(DEMO_TODAY, -daysAgo - 1), reason: "Transferred to another site", assignedById: old.assignedById,
    });
    old.fromDate = addDays(DEMO_TODAY, -daysAgo);
    old.reason = "Transferred from another site";
  };
  transfer("emp_w_site_korba_pipe_2_1", "site_korba_pipe_1", "site_korba_pipe_2", 40);
  transfer("emp_w_site_mh_culvert_2_1", "site_mh_culvert_1", "site_mh_culvert_2", 30);

  // ---- Attendance: last 14 days, current assignments only ----
  const days = lastNDays(14);
  const current = db.siteAssignments.filter((a) => !a.toDate || a.toDate >= DEMO_TODAY);
  days.forEach((date) => {
    const sunday = dayOfWeek(date) === 0;
    current.forEach((a) => {
      if (date < a.fromDate) return;
      // Supervisor at the CSPDCL colony site has not marked today yet.
      if (date === DEMO_TODAY && a.siteId === "site_csp_roads_1") return;
      const site = db.sites.find((s) => s.id === a.siteId)!;
      const region = projectOf(SITE_DEFS.find((d) => d.id === site.id)!.projectKey).regionKey;
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
        ...meta(`att_${a.employeeId}_${date}`),
        employeeId: a.employeeId, siteId: a.siteId, projectId: a.projectId, regionId: RegionKey[region], date, status, dayFraction: fraction,
        overtimeMinutes: status === "PRESENT" && a.role === "Worker" && rng.chance(0.2) ? rng.pick([60, 90, 120, 180]) : 0,
        source: "SUPERVISOR", markedById: SITE_USER[region].supervisor, clientUuid: `att-${a.employeeId}-${date}`,
      });
    });
  });
}
