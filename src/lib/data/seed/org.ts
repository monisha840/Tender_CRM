import type { PermissionAction, PermissionScope } from "@/types";
import { meta, RegionKey, StateOf, type RegionKeyName, type SeedCtx } from "./helpers";

/** Keys must match `NAV_MODULES` in src/lib/nav.ts. */
export const MODULE_KEYS = [
  "dashboard",
  "tenders",
  "projects",
  "sites",
  "people",
  "subcontractors",
  "attendance",
  "purchases",
  "accounts",
  "gst",
  "epf",
  "reports",
  "approvals",
  "notifications",
  "settings",
] as const;

const ACTIONS: PermissionAction[] = [
  "VIEW",
  "CREATE",
  "EDIT",
  "APPROVE",
  "ASSIGN_WORK",
  "SUBMIT",
  "REJECT",
  "MANAGE_FINANCE",
];

interface RoleSpec {
  key: string;
  name: string;
  description: string;
  layout: "OFFICE" | "SITE";
  homePath: string;
  scope: PermissionScope;
  /** module → actions granted. */
  grants: Record<string, PermissionAction[]>;
}

const V: PermissionAction[] = ["VIEW"];

const ROLE_SPECS: RoleSpec[] = [
  {
    key: "director",
    name: "Director / MD",
    description: "Final business decisions, tender approval, overall financial and operational visibility.",
    layout: "OFFICE",
    homePath: "/dashboard",
    scope: "ALL",
    grants: Object.fromEntries(
      MODULE_KEYS.map((m) => [
        m,
        ["tenders", "purchases", "subcontractors", "accounts", "attendance", "approvals"].includes(m)
          ? (["VIEW", "APPROVE", "REJECT"] as PermissionAction[])
          : V,
      ]),
    ),
  },
  {
    key: "tender_exec",
    name: "Tender Executive",
    description: "Find tenders, prepare bids, collect documents, coordinate approvals, submit bids.",
    layout: "OFFICE",
    homePath: "/tenders",
    scope: "ALL",
    grants: {
      dashboard: V,
      tenders: ["VIEW", "CREATE", "EDIT", "SUBMIT"],
      approvals: V,
      reports: V,
      notifications: V,
    },
  },
  {
    key: "regional_head",
    name: "Regional Head",
    description: "Regional feasibility, resources and execution capability; may approve GO/NO-GO.",
    layout: "OFFICE",
    homePath: "/dashboard",
    scope: "OWN_REGION",
    grants: {
      dashboard: V,
      tenders: ["VIEW", "APPROVE", "REJECT"],
      projects: V,
      sites: V,
      people: V,
      subcontractors: V,
      attendance: V,
      purchases: ["VIEW", "APPROVE", "REJECT"],
      approvals: ["VIEW", "APPROVE", "REJECT"],
      reports: V,
      notifications: V,
    },
  },
  {
    key: "accounts",
    name: "Accounts / Finance",
    description: "EMD, tender fees, PBG, purchases, payments, payroll, GST and financial records.",
    layout: "OFFICE",
    homePath: "/accounts",
    scope: "ALL",
    grants: {
      dashboard: V,
      tenders: V,
      projects: V,
      subcontractors: ["VIEW", "MANAGE_FINANCE"],
      attendance: ["VIEW", "MANAGE_FINANCE"],
      purchases: ["VIEW", "MANAGE_FINANCE"],
      accounts: ["VIEW", "CREATE", "EDIT", "MANAGE_FINANCE"],
      gst: ["VIEW", "MANAGE_FINANCE"],
      epf: ["VIEW", "MANAGE_FINANCE"],
      reports: V,
      approvals: V,
      notifications: V,
    },
  },
  {
    key: "legal_admin",
    name: "Legal / Admin",
    description: "Company documents, declarations, agreements, authorisations and compliance.",
    layout: "OFFICE",
    homePath: "/tenders",
    scope: "ALL",
    grants: {
      dashboard: V,
      tenders: ["VIEW", "CREATE", "EDIT"],
      projects: V,
      people: V,
      approvals: V,
      notifications: V,
      settings: V,
    },
  },
  {
    key: "project_manager",
    name: "Project Manager",
    description: "Owns the project after award: execution plan, resources, BOQ, site team, progress.",
    layout: "OFFICE",
    homePath: "/projects",
    scope: "OWN_PROJECTS",
    grants: {
      dashboard: V,
      projects: ["VIEW", "EDIT", "ASSIGN_WORK"],
      sites: ["VIEW", "ASSIGN_WORK"],
      people: V,
      subcontractors: V,
      attendance: V,
      purchases: ["VIEW", "APPROVE", "REJECT"],
      approvals: ["VIEW", "APPROVE", "REJECT"],
      reports: V,
      notifications: V,
    },
  },
  {
    key: "site_engineer",
    name: "Site Engineer",
    description: "Daily work updates, manpower, materials, progress, site issues and photos.",
    layout: "SITE",
    homePath: "/sites",
    scope: "OWN_SITES",
    grants: {
      sites: ["VIEW", "CREATE", "EDIT", "SUBMIT"],
      attendance: ["VIEW", "CREATE", "SUBMIT"],
      purchases: ["VIEW", "CREATE", "SUBMIT"],
      notifications: V,
    },
  },
  {
    key: "supervisor",
    name: "Supervisor",
    description: "Marks attendance, submits daily reports and site requests.",
    layout: "SITE",
    homePath: "/sites",
    scope: "OWN_SITES",
    grants: {
      sites: ["VIEW", "CREATE", "SUBMIT"],
      attendance: ["VIEW", "CREATE", "SUBMIT"],
      purchases: ["VIEW", "CREATE"],
      notifications: V,
    },
  },
];

export interface UserSpec {
  key: string;
  name: string;
  role: string;
  regions: RegionKeyName[];
  phone: string;
  home: RegionKeyName;
}

/** One demo persona per role (plus regional spread). The role switcher lists these. */
export const USER_SPECS: UserSpec[] = [
  { key: "director", name: "Rajesh Agarwal", role: "director", regions: ["korba", "delhi", "mh"], phone: "98260 11001", home: "korba" },
  { key: "tender1", name: "Neha Verma", role: "tender_exec", regions: ["korba", "delhi", "mh"], phone: "98260 11002", home: "korba" },
  { key: "tender2", name: "Aman Khurana", role: "tender_exec", regions: ["delhi", "mh"], phone: "98110 22003", home: "delhi" },
  { key: "rh_korba", name: "Sandeep Tiwari", role: "regional_head", regions: ["korba"], phone: "98260 11004", home: "korba" },
  { key: "rh_delhi", name: "Vikram Malhotra", role: "regional_head", regions: ["delhi"], phone: "98110 22005", home: "delhi" },
  { key: "rh_mh", name: "Prashant Deshmukh", role: "regional_head", regions: ["mh"], phone: "98220 33006", home: "mh" },
  { key: "accounts", name: "Kavita Sharma", role: "accounts", regions: ["korba", "delhi", "mh"], phone: "98260 11007", home: "korba" },
  { key: "legal", name: "Rohit Jain", role: "legal_admin", regions: ["korba", "delhi", "mh"], phone: "98260 11008", home: "korba" },
  { key: "pm_korba1", name: "Anil Chandrakar", role: "project_manager", regions: ["korba"], phone: "98260 11009", home: "korba" },
  { key: "pm_korba2", name: "Deepak Sahu", role: "project_manager", regions: ["korba"], phone: "98260 11010", home: "korba" },
  { key: "pm_delhi", name: "Mohit Saxena", role: "project_manager", regions: ["delhi"], phone: "98110 22011", home: "delhi" },
  { key: "pm_mh", name: "Nitin Patil", role: "project_manager", regions: ["mh"], phone: "98220 33012", home: "mh" },
  { key: "se_korba", name: "Ramesh Yadav", role: "site_engineer", regions: ["korba"], phone: "98260 11013", home: "korba" },
  { key: "sup_korba", name: "Dilip Netam", role: "supervisor", regions: ["korba"], phone: "98260 11014", home: "korba" },
  { key: "se_delhi", name: "Imran Qureshi", role: "site_engineer", regions: ["delhi"], phone: "98110 22015", home: "delhi" },
  { key: "sup_delhi", name: "Pankaj Kumar", role: "supervisor", regions: ["delhi"], phone: "98110 22016", home: "delhi" },
  { key: "se_mh", name: "Santosh Jadhav", role: "site_engineer", regions: ["mh"], phone: "98220 33017", home: "mh" },
  { key: "sup_mh", name: "Ganesh More", role: "supervisor", regions: ["mh"], phone: "98220 33018", home: "mh" },
];

export const userId = (key: string) => `usr_${key}`;
export const employeeIdOfUser = (key: string) => `emp_${key}`;
export const roleId = (key: string) => `role_${key}`;

const CLIENTS: { id: string; name: string; short: string; region: RegionKeyName; parent?: string; gstin?: string }[] = [
  { id: "cl_cg_pwd", name: "Chhattisgarh Public Works Department", short: "CG-PWD", region: "korba" },
  { id: "cl_cg_pwd_korba", name: "PWD Korba Division", short: "PWD/KRB", region: "korba", parent: "cl_cg_pwd" },
  { id: "cl_cg_phe", name: "PHE Department, Korba", short: "PHE/KRB", region: "korba" },
  { id: "cl_korba_mc", name: "Korba Municipal Corporation", short: "KMC", region: "korba" },
  { id: "cl_cspdcl", name: "Chhattisgarh State Power Distribution Co. Ltd.", short: "CSPDCL", region: "korba" },
  { id: "cl_secl", name: "South Eastern Coalfields Ltd. (SECL)", short: "SECL", region: "korba" },
  { id: "cl_del_pwd", name: "Public Works Department, Delhi", short: "DEL-PWD", region: "delhi" },
  { id: "cl_djb", name: "Delhi Jal Board", short: "DJB", region: "delhi" },
  { id: "cl_mcd", name: "Municipal Corporation of Delhi", short: "MCD", region: "delhi" },
  { id: "cl_dda", name: "Delhi Development Authority", short: "DDA", region: "delhi" },
  { id: "cl_mh_pwd", name: "Public Works Department, Maharashtra", short: "MH-PWD", region: "mh" },
  { id: "cl_msrdc", name: "Maharashtra State Road Development Corporation", short: "MSRDC", region: "mh" },
  { id: "cl_nmc", name: "Nagpur Municipal Corporation", short: "NMC", region: "mh" },
  { id: "cl_pmc", name: "Pune Municipal Corporation", short: "PMC", region: "mh" },
  { id: "cl_zp_nagpur", name: "Zilla Parishad Nagpur", short: "ZP/NGP", region: "mh" },
];
export const CLIENT_SHORT: Record<string, string> = Object.fromEntries(CLIENTS.map((c) => [c.id, c.short]));

export function seedOrg({ db }: SeedCtx) {

  db.states.push(
    { ...meta("st_cg"), code: "CG", name: "Chhattisgarh", gstStateCode: "22" },
    { ...meta("st_dl"), code: "DL", name: "Delhi", gstStateCode: "07" },
    { ...meta("st_mh"), code: "MH", name: "Maharashtra", gstStateCode: "27" },
  );

  (Object.keys(RegionKey) as RegionKeyName[]).forEach((k) => {
    const names = { korba: "Korba", delhi: "Delhi", mh: "Maharashtra" };
    db.regions.push({
      ...meta(RegionKey[k]),
      name: names[k],
      code: k === "mh" ? "MH" : k === "delhi" ? "DEL" : "KRB",
      stateId: StateOf[k],
      isActive: true,
    });
  });

  // One GSTIN per state, plus a second Maharashtra GSTIN (Pune) to show many-to-many in action.
  const gst = [
    { id: "gst_cg", gstin: "22AAACD4521M1Z7", state: "st_cg", addr: "Plot 14, Transport Nagar, Korba, Chhattisgarh 495677" },
    { id: "gst_dl", gstin: "07AAACD4521M1Z3", state: "st_dl", addr: "B-27, Okhla Industrial Area Phase II, New Delhi 110020" },
    { id: "gst_mh1", gstin: "27AAACD4521M1ZK", state: "st_mh", addr: "3rd Floor, Zenith Plaza, Dharampeth, Nagpur 440010" },
    { id: "gst_mh2", gstin: "27AAACD4521M2ZJ", state: "st_mh", addr: "Office 405, Baner Road, Pune 411045" },
  ];
  gst.forEach((g) =>
    db.gstRegistrations.push({
      ...meta(g.id),
      gstin: g.gstin,
      legalName: "Demo Infra Projects Pvt. Ltd.",
      tradeName: "Demo Infra",
      stateId: g.state,
      panNumber: "AAACD4521M",
      address: g.addr,
      validFrom: "2019-07-01",
      validTo: null,
      isActive: true,
    }),
  );
  const links: [string, string, boolean][] = [
    ["reg_korba", "gst_cg", true],
    ["reg_delhi", "gst_dl", true],
    ["reg_mh", "gst_mh1", true],
    ["reg_mh", "gst_mh2", false],
  ];
  links.forEach(([region, g, isDefault], i) =>
    db.regionGstRegistrations.push({
      ...meta(`rgst_${i + 1}`),
      regionId: region,
      gstRegistrationId: g,
      isDefault,
      validFrom: "2019-07-01",
      validTo: null,
    }),
  );

  CLIENTS.forEach((c) =>
    db.clients.push({
      ...meta(c.id),
      name: c.name,
      gstin: null,
      address: null,
      stateId: StateOf[c.region],
      parentId: c.parent ?? null,
    }),
  );

  // Roles, permission catalogue and grants
  ROLE_SPECS.forEach((r) =>
    db.roles.push({
      ...meta(roleId(r.key)),
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: true,
      isActive: true,
      layout: r.layout,
      homePath: r.homePath,
    }),
  );
  MODULE_KEYS.forEach((m) =>
    ACTIONS.forEach((a) => db.permissions.push({ ...meta(`perm_${m}_${a}`), module: m, action: a })),
  );
  ROLE_SPECS.forEach((r) =>
    Object.entries(r.grants).forEach(([module, actions]) =>
      actions.forEach((a) =>
        db.rolePermissions.push({
          ...meta(`rp_${r.key}_${module}_${a}`),
          roleId: roleId(r.key),
          permissionId: `perm_${module}_${a}`,
          scope: r.scope,
        }),
      ),
    ),
  );

  // Users + their employee identity + regions
  USER_SPECS.forEach((u, i) => {
    const slug = u.name.toLowerCase().replace(/[^a-z]+/g, ".");
    db.users.push({ ...meta(userId(u.key)), name: u.name, email: `${slug}@demoinfra.example`, isActive: true });
    db.userRoles.push({ ...meta(`ur_${u.key}`), userId: userId(u.key), roleId: roleId(u.role) });
    u.regions.forEach((r) =>
      db.userRegions.push({ ...meta(`uregion_${u.key}_${r}`), userId: userId(u.key), regionId: RegionKey[r] }),
    );
    db.employees.push({
      ...meta(employeeIdOfUser(u.key)),
      code: `EMP-${String(i + 1).padStart(3, "0")}`,
      name: u.name,
      phone: u.phone,
      homeRegionId: RegionKey[u.home],
      userId: userId(u.key),
    });
  });

}
