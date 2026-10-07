import type { PermissionAction, PermissionScope } from "@/types";
import { meta, RegionKey, StateOf, type RegionKeyName, type SeedCtx } from "./helpers";

/** The company this tool is configured for. */
export const COMPANY = {
  legalName: "S. Prince Hightech Pvt. Ltd.",
  tradeName: "S. Prince",
  pan: "AAECS4128K",
} as const;

/** Keys must match `NAV_MODULES` in src/lib/nav.ts. */
export const MODULE_KEYS = [
  "dashboard",
  "tenders",
  "projects",
  "subcontractors",
  "employees",
  "finance",
  "daily_work",
  "approvals",
  "settings",
  "notifications",
] as const;

const ACTIONS: PermissionAction[] = ["VIEW", "CREATE", "EDIT", "APPROVE", "ASSIGN_WORK", "SUBMIT", "REJECT", "MANAGE_FINANCE"];

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
const VAR: PermissionAction[] = ["VIEW", "APPROVE", "REJECT"];

const ROLE_SPECS: RoleSpec[] = [
  {
    key: "director",
    name: "Director / CMD",
    description: "Final business decisions, tender approval, overall financial and operational visibility.",
    layout: "OFFICE",
    homePath: "/dashboard",
    scope: "ALL",
    grants: Object.fromEntries(
      MODULE_KEYS.map((m) => [m, ["tenders", "subcontractors", "employees", "finance", "daily_work", "approvals"].includes(m) ? VAR : V]),
    ),
  },
  {
    key: "tender_exec",
    name: "Tender Executive",
    description: "Find tenders, prepare bids, collect documents, coordinate approvals, submit bids.",
    layout: "OFFICE",
    homePath: "/tenders",
    scope: "ALL",
    grants: { dashboard: V, tenders: ["VIEW", "CREATE", "EDIT", "SUBMIT"], approvals: V, notifications: V },
  },
  {
    key: "regional_head",
    name: "Regional Head",
    description: "Regional feasibility, resources and execution capability; may approve GO/NO-GO.",
    layout: "OFFICE",
    homePath: "/dashboard",
    scope: "OWN_REGION",
    grants: {
      dashboard: V, tenders: VAR, projects: V, subcontractors: V, employees: V, daily_work: VAR, approvals: VAR, notifications: V,
    },
  },
  {
    key: "accounts",
    name: "Accounts / Finance",
    description: "Invoices, receipts, payments, payroll, PF/ESI and GST records.",
    layout: "OFFICE",
    homePath: "/finance",
    scope: "ALL",
    grants: {
      dashboard: V, tenders: V, projects: V,
      subcontractors: ["VIEW", "MANAGE_FINANCE"], employees: ["VIEW", "MANAGE_FINANCE"], daily_work: V,
      finance: ["VIEW", "CREATE", "EDIT", "MANAGE_FINANCE"], approvals: V, notifications: V,
    },
  },
  {
    key: "legal_admin",
    name: "Legal / Admin",
    description: "Company documents, declarations, licences, agreements and compliance.",
    layout: "OFFICE",
    homePath: "/tenders",
    scope: "ALL",
    grants: { dashboard: V, tenders: ["VIEW", "CREATE", "EDIT"], projects: V, employees: V, approvals: V, notifications: V, settings: V },
  },
  {
    key: "project_manager",
    name: "Project Manager",
    description: "Owns the project after award: resources, BOQ, subcontractors, site team and progress.",
    layout: "OFFICE",
    homePath: "/projects",
    scope: "OWN_PROJECTS",
    grants: {
      dashboard: V, projects: ["VIEW", "EDIT", "ASSIGN_WORK"], subcontractors: V, employees: V,
      daily_work: ["VIEW", "ASSIGN_WORK", "APPROVE", "REJECT"], approvals: VAR, notifications: V,
    },
  },
  {
    key: "site_engineer",
    name: "Site Engineer",
    description: "Daily work reports, manpower, materials, progress, site issues and photos.",
    layout: "SITE",
    homePath: "/daily-work",
    scope: "OWN_SITES",
    grants: {
      daily_work: ["VIEW", "CREATE", "EDIT", "SUBMIT"], employees: ["VIEW", "CREATE", "SUBMIT"], notifications: V,
    },
  },
  {
    key: "supervisor",
    name: "Supervisor",
    description: "Marks attendance, submits daily reports and site requests.",
    layout: "SITE",
    homePath: "/daily-work",
    scope: "OWN_SITES",
    grants: { daily_work: ["VIEW", "CREATE", "SUBMIT"], employees: ["VIEW", "CREATE", "SUBMIT"], notifications: V },
  },
];

export interface UserSpec {
  key: string;
  name: string;
  role: string;
  regions: RegionKeyName[];
  phone: string;
  home: RegionKeyName;
  /** Designation shown in the employee record when it differs from the role. */
  title?: string;
}

const ALL: RegionKeyName[] = ["cg", "mh", "south", "delhi"];

/** One demo persona per role (plus regional spread). The role switcher lists these. */
export const USER_SPECS: UserSpec[] = [
  { key: "stalin", name: "Dr. A. Joseph Stalin", role: "director", regions: ALL, phone: "98400 10001", home: "south", title: "Chairman & Managing Director" },
  { key: "antony", name: "Antony Bala Prince", role: "director", regions: ALL, phone: "98400 10002", home: "south", title: "Director" },
  { key: "augusti", name: "Augusti Marys Priyadarshini", role: "director", regions: ALL, phone: "98400 10003", home: "mh", title: "Director" },
  { key: "tender1", name: "Karthik Subramanian", role: "tender_exec", regions: ALL, phone: "98400 10004", home: "south" },
  { key: "tender2", name: "Rahul Deshmukh", role: "tender_exec", regions: ALL, phone: "98200 20005", home: "mh" },
  { key: "rh_cg", name: "Sandeep Tiwari", role: "regional_head", regions: ["cg"], phone: "98260 30006", home: "cg" },
  { key: "rh_mh", name: "Prashant Deshmukh", role: "regional_head", regions: ["mh"], phone: "98220 20007", home: "mh" },
  { key: "rh_south", name: "Murugan Selvam", role: "regional_head", regions: ["south"], phone: "98400 10008", home: "south" },
  { key: "rh_delhi", name: "Vikram Malhotra", role: "regional_head", regions: ["delhi"], phone: "98110 40009", home: "delhi" },
  { key: "accounts", name: "Kavitha Raman", role: "accounts", regions: ALL, phone: "98400 10010", home: "south" },
  { key: "legal", name: "Meenakshi Iyer", role: "legal_admin", regions: ALL, phone: "98200 20011", home: "mh" },
  { key: "pm_cg1", name: "Anil Chandrakar", role: "project_manager", regions: ["cg"], phone: "98260 30012", home: "cg" },
  { key: "pm_cg2", name: "Deepak Sahu", role: "project_manager", regions: ["cg"], phone: "98260 30013", home: "cg" },
  { key: "pm_mh", name: "Nitin Patil", role: "project_manager", regions: ["mh"], phone: "98220 20014", home: "mh" },
  { key: "pm_south", name: "Senthil Kumar", role: "project_manager", regions: ["south"], phone: "98400 10015", home: "south" },
  { key: "pm_delhi", name: "Mohit Saxena", role: "project_manager", regions: ["delhi"], phone: "98110 40016", home: "delhi" },
  { key: "se_cg", name: "Ramesh Yadav", role: "site_engineer", regions: ["cg"], phone: "98260 30017", home: "cg" },
  { key: "sup_cg", name: "Dilip Netam", role: "supervisor", regions: ["cg"], phone: "98260 30018", home: "cg" },
  { key: "se_mh", name: "Santosh Jadhav", role: "site_engineer", regions: ["mh"], phone: "98220 20019", home: "mh" },
  { key: "sup_mh", name: "Ganesh More", role: "supervisor", regions: ["mh"], phone: "98220 20020", home: "mh" },
  { key: "se_south", name: "Arul Prakash", role: "site_engineer", regions: ["south"], phone: "98400 10021", home: "south" },
  { key: "sup_south", name: "Muthu Kumar", role: "supervisor", regions: ["south"], phone: "98400 10022", home: "south" },
  { key: "se_delhi", name: "Imran Qureshi", role: "site_engineer", regions: ["delhi"], phone: "98110 40023", home: "delhi" },
  { key: "sup_delhi", name: "Pankaj Kumar", role: "supervisor", regions: ["delhi"], phone: "98110 40024", home: "delhi" },
];

export const userId = (key: string) => `usr_${key}`;
export const employeeIdOfUser = (key: string) => `emp_${key}`;
export const roleId = (key: string) => `role_${key}`;

/** Customer organisations. `pan` is used to build the customer GSTIN on invoices (demo values). */
export const ORGANISATIONS = [
  { id: "org_ntpc", name: "NTPC Limited", short: "NTPC", state: "st_dl", pan: "AAACN0255D" },
  { id: "org_cspgcl", name: "Chhattisgarh State Power Generation Company Ltd.", short: "CSPGCL", state: "st_cg", pan: "AAFCC9140M" },
  { id: "org_mspgcl", name: "Maharashtra State Power Generation Company Ltd.", short: "MSPGCL", state: "st_mh", pan: "AAFCM3318K" },
  { id: "org_dvc", name: "Damodar Valley Corporation", short: "DVC", state: "st_wb", pan: "AAAGD0041B" },
  { id: "org_mppgcl", name: "Madhya Pradesh Power Generating Company Ltd.", short: "MPPGCL", state: "st_mp", pan: "AAFCM6207Q" },
  { id: "org_kpcl", name: "Karnataka Power Corporation Ltd.", short: "KPCL", state: "st_ka", pan: "AAACK0586G" },
  { id: "org_tangedco", name: "Tamil Nadu Generation and Distribution Corporation Ltd.", short: "TANGEDCO", state: "st_tn", pan: "AAFCT1234R" },
  { id: "org_iocl", name: "Indian Oil Corporation Ltd.", short: "IOCL", state: "st_dl", pan: "AAACI1681G" },
  { id: "org_nalco", name: "National Aluminium Company Ltd.", short: "NALCO", state: "st_od", pan: "AAACN0301P" },
] as const;
export const ORG_SHORT: Record<string, string> = Object.fromEntries(ORGANISATIONS.map((c) => [c.id, c.short]));
export const ORG_PAN: Record<string, string> = Object.fromEntries(ORGANISATIONS.map((c) => [c.id, c.pan]));

const STATES = [
  { id: "st_mh", code: "MH", name: "Maharashtra", gst: "27" },
  { id: "st_cg", code: "CG", name: "Chhattisgarh", gst: "22" },
  { id: "st_tn", code: "TN", name: "Tamil Nadu", gst: "33" },
  { id: "st_dl", code: "DL", name: "Delhi", gst: "07" },
  { id: "st_ka", code: "KA", name: "Karnataka", gst: "29" },
  { id: "st_mp", code: "MP", name: "Madhya Pradesh", gst: "23" },
  { id: "st_od", code: "OD", name: "Odisha", gst: "21" },
  { id: "st_wb", code: "WB", name: "West Bengal", gst: "19" },
  { id: "st_hr", code: "HR", name: "Haryana", gst: "06" },
] as const;
export const GST_STATE_CODE: Record<string, string> = Object.fromEntries(STATES.map((s) => [s.id, s.gst]));

export function seedOrg({ db }: SeedCtx) {
  STATES.forEach((s) => db.states.push({ ...meta(s.id), code: s.code, name: s.name, gstStateCode: s.gst }));

  const regionNames: Record<RegionKeyName, [string, string]> = {
    cg: ["Chhattisgarh", "CG"],
    mh: ["Maharashtra", "MH"],
    south: ["South", "SOUTH"],
    delhi: ["Delhi", "DEL"],
  };
  (Object.keys(RegionKey) as RegionKeyName[]).forEach((k) =>
    db.regions.push({ ...meta(RegionKey[k]), name: regionNames[k][0], code: regionNames[k][1], stateId: StateOf[k], isActive: true }),
  );

  // Offices: registered office in Mumbai, branch in Chennai, a Delhi-region office and a Korba site office.
  db.offices.push(
    { ...meta("off_mumbai"), regionId: "reg_mh", name: "Registered Office, Mumbai", kind: "REGISTERED", address: "Mumbai, Maharashtra" },
    { ...meta("off_chennai"), regionId: "reg_south", name: "Branch Office, Chennai", kind: "BRANCH", address: "Chennai, Tamil Nadu" },
    { ...meta("off_delhi"), regionId: "reg_delhi", name: "Delhi Regional Office", kind: "REGIONAL", address: "New Delhi" },
    { ...meta("off_korba"), regionId: "reg_cg", name: "Korba Site Office", kind: "SITE_OFFICE", address: "Korba, Chhattisgarh" },
  );

  // One GSTIN per operating office state. Other plant states are served from the nearest registration (IGST).
  const gst = [
    { id: "gst_mh", gstin: "27AAECS4128K1ZP", state: "st_mh", addr: "Registered Office, Mumbai, Maharashtra" },
    { id: "gst_tn", gstin: "33AAECS4128K1ZM", state: "st_tn", addr: "Branch Office, Chennai, Tamil Nadu" },
    { id: "gst_dl", gstin: "07AAECS4128K1ZT", state: "st_dl", addr: "Delhi Regional Office, New Delhi" },
    { id: "gst_cg", gstin: "22AAECS4128K1ZK", state: "st_cg", addr: "Korba Site Office, Korba, Chhattisgarh" },
  ];
  gst.forEach((g) =>
    db.gstRegistrations.push({
      ...meta(g.id), gstin: g.gstin, legalName: COMPANY.legalName, tradeName: COMPANY.tradeName, stateId: g.state, panNumber: COMPANY.pan,
      address: g.addr, validFrom: "2017-07-01", validTo: null, isActive: true,
    }),
  );
  (
    [["reg_cg", "gst_cg"], ["reg_mh", "gst_mh"], ["reg_south", "gst_tn"], ["reg_delhi", "gst_dl"]] as const
  ).forEach(([region, g], i) =>
    db.regionGstRegistrations.push({ ...meta(`rgst_${i + 1}`), regionId: region, gstRegistrationId: g, isDefault: true, validFrom: "2017-07-01", validTo: null }),
  );

  ORGANISATIONS.forEach((o) =>
    db.organisations.push({ ...meta(o.id), name: o.name, shortName: o.short, gstin: null, address: null, stateId: o.state, parentId: null }),
  );

  ROLE_SPECS.forEach((r) =>
    db.roles.push({
      ...meta(roleId(r.key)), key: r.key, name: r.name, description: r.description, isSystem: true, isActive: true, layout: r.layout, homePath: r.homePath,
    }),
  );
  MODULE_KEYS.forEach((m) => ACTIONS.forEach((a) => db.permissions.push({ ...meta(`perm_${m}_${a}`), module: m, action: a })));
  ROLE_SPECS.forEach((r) =>
    Object.entries(r.grants).forEach(([module, actions]) =>
      actions.forEach((a) =>
        db.rolePermissions.push({ ...meta(`rp_${r.key}_${module}_${a}`), roleId: roleId(r.key), permissionId: `perm_${module}_${a}`, scope: r.scope }),
      ),
    ),
  );

  USER_SPECS.forEach((u, i) => {
    const slug = u.name.toLowerCase().replace(/^dr\.\s*/, "").replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
    db.users.push({ ...meta(userId(u.key)), name: u.name, email: `${slug}@sprince.example`, isActive: true });
    db.userRoles.push({ ...meta(`ur_${u.key}`), userId: userId(u.key), roleId: roleId(u.role) });
    u.regions.forEach((r) => db.userRegions.push({ ...meta(`uregion_${u.key}_${r}`), userId: userId(u.key), regionId: RegionKey[r] }));
    db.employees.push({
      ...meta(employeeIdOfUser(u.key)), code: `SPH-${String(i + 1).padStart(3, "0")}`, name: u.name, phone: u.phone, homeRegionId: RegionKey[u.home], userId: userId(u.key),
    });
  });
}
