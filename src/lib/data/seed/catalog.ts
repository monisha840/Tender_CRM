import type { BillingCycle, ContractType } from "@/types";
import type { RegionKeyName } from "./helpers";
import type { ServiceLineKey, StageKey } from "./masters";

/** BOQ template per project; the "package" is the mixed civil + stone picking + painting job. */
export type Template = "stone" | "paint" | "cbp" | "steel" | "civil" | "scaff" | "package";

// ---------------------------------------------------------------------------------------------
// Plant sites
// ---------------------------------------------------------------------------------------------
export interface SiteSeed {
  id: string;
  code: string;
  name: string;
  org: string;
  region: RegionKeyName;
  state: string;
  address: string;
  cutoff: string;
}

export const SITES: SiteSeed[] = [
  { id: "site_ntpc_korba", code: "NTPC-KRB", name: "NTPC Korba", org: "org_ntpc", region: "cg", state: "st_cg", address: "NTPC Korba Super Thermal Power Station, Jamnipali, Korba, Chhattisgarh", cutoff: "18:00" },
  { id: "site_cspgcl_kw", code: "CSPGCL-KW", name: "CSPGCL Korba West", org: "org_cspgcl", region: "cg", state: "st_cg", address: "Korba West Thermal Power Station, Dargahan, Korba, Chhattisgarh", cutoff: "18:00" },
  { id: "site_mspgcl_chd", code: "MSPGCL-CHD", name: "MSPGCL Chandrapur", org: "org_mspgcl", region: "mh", state: "st_mh", address: "Chandrapur Super Thermal Power Station, Urjanagar, Chandrapur, Maharashtra", cutoff: "18:00" },
  { id: "site_mspgcl_kor", code: "MSPGCL-KOR", name: "MSPGCL Koradi", org: "org_mspgcl", region: "mh", state: "st_mh", address: "Koradi Thermal Power Station, Koradi, Nagpur, Maharashtra", cutoff: "18:00" },
  { id: "site_mppgcl_sarni", code: "MPPGCL-SRN", name: "MPPGCL Sarni", org: "org_mppgcl", region: "mh", state: "st_mp", address: "Sarni Thermal Power Station, Sarni, Betul, Madhya Pradesh", cutoff: "17:30" },
  { id: "site_tangedco_mettur", code: "TNG-MTR", name: "TANGEDCO Mettur", org: "org_tangedco", region: "south", state: "st_tn", address: "Mettur Thermal Power Station, Mettur Dam, Salem, Tamil Nadu", cutoff: "17:30" },
  { id: "site_tangedco_nch", code: "TNG-NCH", name: "TANGEDCO North Chennai", org: "org_tangedco", region: "south", state: "st_tn", address: "North Chennai Thermal Power Station, Athipattu, Chennai, Tamil Nadu", cutoff: "17:30" },
  { id: "site_kpcl_raichur", code: "KPCL-RCH", name: "KPCL Raichur", org: "org_kpcl", region: "south", state: "st_ka", address: "Raichur Thermal Power Station, Shaktinagar, Raichur, Karnataka", cutoff: "17:30" },
  { id: "site_dvc_mejia", code: "DVC-MEJ", name: "DVC Mejia", org: "org_dvc", region: "delhi", state: "st_wb", address: "Mejia Thermal Power Station, Durlavpur, Bankura, West Bengal", cutoff: "18:00" },
  { id: "site_nalco_angul", code: "NALCO-ANG", name: "NALCO Angul", org: "org_nalco", region: "delhi", state: "st_od", address: "NALCO Captive Power Plant, Angul, Odisha", cutoff: "18:00" },
  { id: "site_iocl_panipat", code: "IOCL-PNP", name: "IOCL Panipat Refinery", org: "org_iocl", region: "delhi", state: "st_hr", address: "Panipat Refinery, Baholi, Panipat, Haryana", cutoff: "17:30" },
];

// ---------------------------------------------------------------------------------------------
// Tenders
// ---------------------------------------------------------------------------------------------
export type WonPhase = "NO_LOA" | "LOA" | "CONVERTED";

export interface TenderSpec {
  key: string;
  title: string;
  org: string;
  /** Plant site when we already operate there. */
  site?: string;
  region: RegionKeyName;
  loc: string;
  sl: ServiceLineKey;
  /** Index into TENDER_TYPES. */
  type: 0 | 1 | 2;
  /** Index into PORTALS. */
  portal: number;
  /** Government estimate, in lakh. */
  est: number;
  stage: StageKey;
  /** Submission deadline, in days from the demo "today". */
  dl: number;
  /** Our bid vs estimate, in percent (negative = below). */
  pct?: number;
  /** LOST only: technical bid rejected rather than outbid. */
  techRejected?: boolean;
  /** WON only. */
  phase?: WonPhase;
}

const T = (t: TenderSpec): TenderSpec => t;

export const TENDER_SPECS: TenderSpec[] = [
  // ---- Won and converted: these become the 11 projects ----
  T({ key: "p1_ntpc_stone", title: "Deployment of manpower for stone picking from running coal conveyor, CHP, 2 years", org: "org_ntpc", site: "site_ntpc_korba", region: "cg", loc: "NTPC Korba, Chhattisgarh", sl: "stone", type: 0, portal: 0, est: 445, stage: "WON", dl: -290, pct: -5.6, phase: "CONVERTED" }),
  T({ key: "p2_cspgcl_paint", title: "Painting of boiler structure, Unit 3", org: "org_cspgcl", site: "site_cspgcl_kw", region: "cg", loc: "CSPGCL Korba West, Chhattisgarh", sl: "paint", type: 1, portal: 3, est: 125, stage: "WON", dl: -200, pct: -8.0, phase: "CONVERTED" }),
  T({ key: "p3_mspgcl_cbp", title: "Supply and laying of cast basalt lined pipeline for ash slurry disposal, Stage III", org: "org_mspgcl", site: "site_mspgcl_chd", region: "mh", loc: "MSPGCL Chandrapur, Maharashtra", sl: "cbp", type: 1, portal: 2, est: 960, stage: "WON", dl: -260, pct: -7.3, phase: "CONVERTED" }),
  T({ key: "p4_mspgcl_stone", title: "Deployment of manpower for stone picking from running coal conveyors, CHP, 3 years", org: "org_mspgcl", site: "site_mspgcl_kor", region: "mh", loc: "MSPGCL Koradi, Maharashtra", sl: "stone", type: 0, portal: 2, est: 540, stage: "WON", dl: -330, pct: -5.5, phase: "CONVERTED" }),
  T({ key: "p5_tangedco_scaff", title: "Scaffolding and painting services for boiler and ESP, Mettur TPS, 2 years", org: "org_tangedco", site: "site_tangedco_mettur", region: "south", loc: "TANGEDCO Mettur, Tamil Nadu", sl: "scaff", type: 0, portal: 4, est: 285, stage: "WON", dl: -240, pct: -8.8, phase: "CONVERTED" }),
  T({ key: "p6_ntpc_steel", title: "Design, supply, fabrication and erection of structural steel for conveyor gallery, Stage II", org: "org_ntpc", site: "site_ntpc_korba", region: "cg", loc: "NTPC Korba, Chhattisgarh", sl: "steel", type: 1, portal: 0, est: 1400, stage: "WON", dl: -180, pct: -5.0, phase: "CONVERTED" }),
  T({ key: "p7_mppgcl_civil", title: "Civil repair works to coal handling plant foundations and drains, Sarni TPS", org: "org_mppgcl", site: "site_mppgcl_sarni", region: "mh", loc: "MPPGCL Sarni, Madhya Pradesh", sl: "civil", type: 1, portal: 1, est: 225, stage: "WON", dl: -400, pct: -6.7, phase: "CONVERTED" }),
  T({ key: "p8_nalco_paint", title: "Industrial painting and protective coating of cooling towers, captive power plant, Angul", org: "org_nalco", site: "site_nalco_angul", region: "delhi", loc: "NALCO Angul, Odisha", sl: "paint", type: 1, portal: 1, est: 350, stage: "WON", dl: -210, pct: -5.7, phase: "CONVERTED" }),
  T({ key: "p9_dvc_stone", title: "Manpower for stone picking and coal sizing at coal handling plant, 1 year", org: "org_dvc", site: "site_dvc_mejia", region: "delhi", loc: "DVC Mejia, West Bengal", sl: "stone", type: 0, portal: 1, est: 200, stage: "WON", dl: -480, pct: -5.0, phase: "CONVERTED" }),
  T({ key: "p10_kpcl_pkg", title: "Civil, stone picking and painting package for ash handling area, Raichur TPS", org: "org_kpcl", site: "site_kpcl_raichur", region: "south", loc: "KPCL Raichur, Karnataka", sl: "civil", type: 1, portal: 5, est: 54, stage: "WON", dl: -140, pct: -7.4074, phase: "CONVERTED" }),
  // ---- Won, not yet converted ----
  T({ key: "w1_mspgcl_scaff", title: "Scaffolding and rigging services for boiler overhaul, Chandrapur Unit 6", org: "org_mspgcl", site: "site_mspgcl_chd", region: "mh", loc: "MSPGCL Chandrapur, Maharashtra", sl: "scaff", type: 1, portal: 2, est: 140, stage: "WON", dl: -50, pct: -6.0, phase: "LOA" }),
  T({ key: "w2_kpcl_stone", title: "Stone picking manpower for coal conveyors, Raichur TPS Units 5-8, 2 years", org: "org_kpcl", site: "site_kpcl_raichur", region: "south", loc: "KPCL Raichur, Karnataka", sl: "stone", type: 0, portal: 5, est: 380, stage: "WON", dl: -22, pct: -4.5, phase: "NO_LOA" }),
  // ---- Lost ----
  T({ key: "l9_iocl_paint", title: "Painting of storage tanks and pipe racks, tank farm, Panipat Refinery", org: "org_iocl", site: "site_iocl_panipat", region: "delhi", loc: "IOCL Panipat Refinery, Haryana", sl: "paint", type: 1, portal: 1, est: 175, stage: "LOST", dl: -170, pct: -8.6 }),
  T({ key: "l1_cspgcl_paint", title: "Painting of ESP and chimney structure, Unit 5", org: "org_cspgcl", region: "cg", loc: "CSPGCL Korba West, Chhattisgarh", sl: "paint", type: 1, portal: 3, est: 210, stage: "LOST", dl: -100, pct: -4.0 }),
  T({ key: "l2_mspgcl_stone", title: "Deployment of manpower for stone picking, CHP, Chandrapur, 2 years", org: "org_mspgcl", region: "mh", loc: "MSPGCL Chandrapur, Maharashtra", sl: "stone", type: 0, portal: 2, est: 480, stage: "LOST", dl: -135, pct: -3.0 }),
  T({ key: "l3_tangedco_cbp", title: "Cast basalt lined pipes for ash line, Mettur TPS", org: "org_tangedco", region: "south", loc: "TANGEDCO Mettur, Tamil Nadu", sl: "cbp", type: 1, portal: 4, est: 750, stage: "LOST", dl: -190, pct: -4.2 }),
  T({ key: "l4_iocl_steel", title: "Structural steel for fuel oil tank farm shed, Panipat", org: "org_iocl", region: "delhi", loc: "IOCL Panipat Refinery, Haryana", sl: "steel", type: 1, portal: 1, est: 1250, stage: "LOST", dl: -250, pct: 0.8, techRejected: true }),
  T({ key: "l5_mspgcl_civil", title: "Civil works for ash dyke raising, Koradi", org: "org_mspgcl", region: "mh", loc: "MSPGCL Koradi, Maharashtra", sl: "civil", type: 1, portal: 2, est: 330, stage: "LOST", dl: -80, pct: -2.5 }),
  T({ key: "l6_ntpc_scaff", title: "Scaffolding services for boiler annual overhaul, Korba STPS", org: "org_ntpc", region: "cg", loc: "NTPC Korba, Chhattisgarh", sl: "scaff", type: 2, portal: 0, est: 160, stage: "LOST", dl: -300, pct: -3.5 }),
  T({ key: "l7_dvc_paint", title: "Industrial painting of chimney, Mejia TPS", org: "org_dvc", region: "delhi", loc: "DVC Mejia, West Bengal", sl: "paint", type: 1, portal: 1, est: 95, stage: "LOST", dl: -60, pct: 1.0, techRejected: true }),
  T({ key: "l8_mppgcl_stone", title: "Manpower for coal yard stone picking, Sarni, 1 year", org: "org_mppgcl", region: "mh", loc: "MPPGCL Sarni, Madhya Pradesh", sl: "stone", type: 0, portal: 1, est: 120, stage: "LOST", dl: -210, pct: -2.0 }),
  // ---- Submitted ----
  T({ key: "s1_ntpc_stone", title: "Stone picking manpower for Units 1-3 CHP, Sipat, 2 years", org: "org_ntpc", region: "cg", loc: "NTPC Sipat, Chhattisgarh", sl: "stone", type: 0, portal: 0, est: 520, stage: "SUBMITTED", dl: -3, pct: -4.5 }),
  T({ key: "s2_nalco_cbp", title: "Cast basalt lined pipeline for ash mound slurry, captive power plant, Angul", org: "org_nalco", region: "delhi", loc: "NALCO Angul, Odisha", sl: "cbp", type: 1, portal: 1, est: 880, stage: "SUBMITTED", dl: -6, pct: -3.8 }),
  T({ key: "s3_tangedco_paint", title: "Painting of boiler and turbine hall structures, North Chennai Stage II", org: "org_tangedco", site: "site_tangedco_nch", region: "south", loc: "TANGEDCO North Chennai, Tamil Nadu", sl: "paint", type: 1, portal: 4, est: 410, stage: "SUBMITTED", dl: -2, pct: -6.2 }),
  T({ key: "s4_mspgcl_steel", title: "Structural steel for conveyor belt gallery extension, Koradi", org: "org_mspgcl", site: "site_mspgcl_kor", region: "mh", loc: "MSPGCL Koradi, Maharashtra", sl: "steel", type: 1, portal: 2, est: 1450, stage: "SUBMITTED", dl: -12, pct: -2.9 }),
  T({ key: "s5_iocl_scaff", title: "Scaffolding services for annual turnaround, Panipat Refinery", org: "org_iocl", site: "site_iocl_panipat", region: "delhi", loc: "IOCL Panipat Refinery, Haryana", sl: "scaff", type: 2, portal: 1, est: 300, stage: "SUBMITTED", dl: -9, pct: -5.1 }),
  // ---- Bid Preparing ----
  T({ key: "b1_mppgcl_civil", title: "Civil works for ash pond embankment, Sarni TPS", org: "org_mppgcl", site: "site_mppgcl_sarni", region: "mh", loc: "MPPGCL Sarni, Madhya Pradesh", sl: "civil", type: 1, portal: 1, est: 275, stage: "BID_PREPARING", dl: 3 }),
  T({ key: "b2_kpcl_paint", title: "Industrial painting of boiler structure, Raichur Unit 7", org: "org_kpcl", site: "site_kpcl_raichur", region: "south", loc: "KPCL Raichur, Karnataka", sl: "paint", type: 1, portal: 5, est: 345, stage: "BID_PREPARING", dl: 6 }),
  T({ key: "b3_dvc_stone", title: "Stone picking manpower for CHP, Durgapur Steel TPS, 2 years", org: "org_dvc", region: "delhi", loc: "DVC Durgapur, West Bengal", sl: "stone", type: 0, portal: 1, est: 330, stage: "BID_PREPARING", dl: 5 }),
  T({ key: "b4_cspgcl_cbp", title: "Cast basalt lined pipeline for ash line, Marwa TPS", org: "org_cspgcl", region: "cg", loc: "CSPGCL Marwa, Chhattisgarh", sl: "cbp", type: 1, portal: 3, est: 1180, stage: "BID_PREPARING", dl: 12 }),
  T({ key: "b5_ntpc_steel", title: "Steel structure EPC for coal bunker extension, Korba", org: "org_ntpc", site: "site_ntpc_korba", region: "cg", loc: "NTPC Korba, Chhattisgarh", sl: "steel", type: 1, portal: 0, est: 1500, stage: "BID_PREPARING", dl: 20 }),
  T({ key: "b6_ntpc_paint", title: "Industrial painting of coal bunker structure, Korba STPS", org: "org_ntpc", site: "site_ntpc_korba", region: "cg", loc: "NTPC Korba, Chhattisgarh", sl: "paint", type: 1, portal: 0, est: 185, stage: "BID_PREPARING", dl: 1 }),
  // ---- Under Evaluation (GO / NO-GO pending) ----
  T({ key: "u1_tangedco_scaff", title: "Scaffolding for annual maintenance, Mettur TPS, 2 years", org: "org_tangedco", site: "site_tangedco_mettur", region: "south", loc: "TANGEDCO Mettur, Tamil Nadu", sl: "scaff", type: 0, portal: 4, est: 330, stage: "UNDER_EVALUATION", dl: 14 }),
  T({ key: "u2_nalco_civil", title: "Civil and structural works for captive power plant expansion, Angul", org: "org_nalco", site: "site_nalco_angul", region: "delhi", loc: "NALCO Angul, Odisha", sl: "civil", type: 1, portal: 1, est: 625, stage: "UNDER_EVALUATION", dl: 16 }),
  T({ key: "u3_iocl_paint", title: "Industrial painting of LPG bullets, Panipat Refinery", org: "org_iocl", site: "site_iocl_panipat", region: "delhi", loc: "IOCL Panipat Refinery, Haryana", sl: "paint", type: 1, portal: 1, est: 98, stage: "UNDER_EVALUATION", dl: 15 }),
  T({ key: "u4_mspgcl_paint", title: "Painting and coating of ESP casing, Chandrapur Units 8-9", org: "org_mspgcl", site: "site_mspgcl_chd", region: "mh", loc: "MSPGCL Chandrapur, Maharashtra", sl: "paint", type: 1, portal: 2, est: 470, stage: "UNDER_EVALUATION", dl: 7 }),
  // ---- New ----
  T({ key: "n1_ntpc_stone", title: "Stone picking manpower for coal conveyors, Lara STPP, 2 years", org: "org_ntpc", region: "cg", loc: "NTPC Lara, Chhattisgarh", sl: "stone", type: 0, portal: 0, est: 640, stage: "NEW", dl: 25 }),
  T({ key: "n2_kpcl_scaff", title: "Scaffolding services for boiler maintenance, Bellary TPS", org: "org_kpcl", region: "south", loc: "KPCL Bellary, Karnataka", sl: "scaff", type: 2, portal: 5, est: 150, stage: "NEW", dl: 28 }),
  T({ key: "n3_cspgcl_civil", title: "Roof sheeting and civil repairs, Korba West", org: "org_cspgcl", site: "site_cspgcl_kw", region: "cg", loc: "CSPGCL Korba West, Chhattisgarh", sl: "civil", type: 1, portal: 3, est: 85, stage: "NEW", dl: 2 }),
  T({ key: "n4_mppgcl_paint", title: "Painting of structures, Satpura TPS", org: "org_mppgcl", region: "mh", loc: "MPPGCL Satpura, Madhya Pradesh", sl: "paint", type: 1, portal: 1, est: 190, stage: "NEW", dl: 30 }),
];

// ---------------------------------------------------------------------------------------------
// Projects (one per converted tender)
// ---------------------------------------------------------------------------------------------
export interface ProjectSpec {
  key: string;
  /** Finished contract (kept for billing and payroll history); no active site workforce. */
  completed?: boolean;
  code: string;
  /** Short project name. */
  name: string;
  site: string;
  pm: string;
  template: Template;
  contractType: ContractType;
  billing: BillingCycle;
  paymentTermsDays: number;
  /** Contract duration in days (from the project start date). */
  durationDays: number;
  /** Percentage points behind (+) or ahead (−) of the time-based plan. */
  lag: number;
  /** Persona employee ids for the site engineer / supervisor, if this site has one. */
  engineer?: string;
  supervisor?: string;
  /** Named daily-wage workers at the site, with their roles and base daily wage. */
  workers: { count: number; wage: number; roles: string[] };
}

export const PROJECT_SPECS: ProjectSpec[] = [
  { key: "p1_ntpc_stone", code: "SPH-CG-001", name: "Stone picking manpower, CHP: NTPC Korba", site: "site_ntpc_korba", pm: "pm_cg1", template: "stone", contractType: "SERVICE", billing: "MONTHLY", paymentTermsDays: 30, durationDays: 730, lag: 4, engineer: "emp_se_cg", supervisor: "emp_sup_cg", workers: { count: 22, wage: 640, roles: ["Stone picker", "Stone picker", "Stone picker", "Helper"] } },
  { key: "p2_cspgcl_paint", code: "SPH-CG-002", name: "Painting of boiler structure, Unit 3: CSPGCL Korba West", site: "site_cspgcl_kw", pm: "pm_cg2", template: "paint", contractType: "FIXED_SCOPE", billing: "MILESTONE", paymentTermsDays: 45, durationDays: 270, lag: 18, workers: { count: 12, wage: 660, roles: ["Painter", "Painter", "Blaster", "Helper"] } },
  { key: "p3_mspgcl_cbp", code: "SPH-MH-001", name: "Cast basalt ash slurry pipeline, Stage III: MSPGCL Chandrapur", site: "site_mspgcl_chd", pm: "pm_mh", template: "cbp", contractType: "FIXED_SCOPE", billing: "MILESTONE", paymentTermsDays: 45, durationDays: 540, lag: 9, workers: { count: 12, wage: 740, roles: ["Pipe fitter", "Rigger", "Welder", "Helper"] } },
  { key: "p4_mspgcl_stone", code: "SPH-MH-002", name: "Stone picking manpower, CHP: MSPGCL Koradi", site: "site_mspgcl_kor", pm: "pm_mh", template: "stone", contractType: "SERVICE", billing: "MONTHLY", paymentTermsDays: 30, durationDays: 1095, lag: 1, engineer: "emp_se_mh", supervisor: "emp_sup_mh", workers: { count: 20, wage: 720, roles: ["Stone picker", "Stone picker", "Stone picker", "Helper"] } },
  { key: "p5_tangedco_scaff", code: "SPH-SO-001", name: "Scaffolding and painting services: TANGEDCO Mettur", site: "site_tangedco_mettur", pm: "pm_south", template: "scaff", contractType: "SERVICE", billing: "MONTHLY", paymentTermsDays: 45, durationDays: 730, lag: 7, engineer: "emp_se_south", supervisor: "emp_sup_south", workers: { count: 14, wage: 720, roles: ["Scaffolder", "Scaffolder", "Rigger", "Helper"] } },
  { key: "p6_ntpc_steel", code: "SPH-CG-003", name: "Conveyor gallery structural steel EPC, Stage II: NTPC Korba", site: "site_ntpc_korba", pm: "pm_cg1", template: "steel", contractType: "FIXED_SCOPE", billing: "MILESTONE", paymentTermsDays: 30, durationDays: 450, lag: 21, workers: { count: 16, wage: 700, roles: ["Welder", "Fitter", "Rigger", "Helper"] } },
  { key: "p7_mppgcl_civil", completed: true, code: "SPH-MH-003", name: "CHP foundation and drain repairs: MPPGCL Sarni", site: "site_mppgcl_sarni", pm: "pm_mh", template: "civil", contractType: "FIXED_SCOPE", billing: "MILESTONE", paymentTermsDays: 60, durationDays: 300, lag: 0, workers: { count: 0, wage: 680, roles: ["Mason", "Bar bender", "Helper"] } },
  { key: "p8_nalco_paint", code: "SPH-DL-001", name: "Cooling tower painting and coating: NALCO Angul", site: "site_nalco_angul", pm: "pm_delhi", template: "paint", contractType: "FIXED_SCOPE", billing: "MILESTONE", paymentTermsDays: 45, durationDays: 365, lag: -1, engineer: "emp_se_delhi", supervisor: "emp_sup_delhi", workers: { count: 12, wage: 700, roles: ["Painter", "Painter", "Blaster", "Helper"] } },
  { key: "p9_dvc_stone", completed: true, code: "SPH-DL-002", name: "Stone picking and coal sizing: DVC Mejia", site: "site_dvc_mejia", pm: "pm_delhi", template: "stone", contractType: "SERVICE", billing: "MONTHLY", paymentTermsDays: 45, durationDays: 365, lag: 0, workers: { count: 0, wage: 680, roles: ["Helper"] } },
  { key: "p10_kpcl_pkg", code: "SPH-SO-002", name: "Ash handling area civil, stone picking and painting package: KPCL Raichur", site: "site_kpcl_raichur", pm: "pm_south", template: "package", contractType: "FIXED_SCOPE", billing: "MILESTONE", paymentTermsDays: 30, durationDays: 240, lag: 3, workers: { count: 10, wage: 700, roles: ["Stone picker", "Painter", "Mason", "Helper"] } },
];

/** Office staff beyond the named personas (to reach a realistic headcount). */
export const OFFICE_STAFF: { id: string; name: string; designation: string; department: string; region: RegionKeyName; wage: number }[] = [
  { id: "emp_off_1", name: "Lakshmi Narayanan", designation: "Accounts Assistant", department: "Accounts & Finance", region: "south", wage: 28000 },
  { id: "emp_off_2", name: "Revathi Chandran", designation: "HR & Payroll Executive", department: "HR & Admin", region: "south", wage: 34000 },
  { id: "emp_off_3", name: "Sachin Gaikwad", designation: "Store Keeper", department: "Stores & Purchase", region: "mh", wage: 26000 },
  { id: "emp_off_4", name: "Bhupendra Kanwar", designation: "Safety Officer", department: "Safety", region: "cg", wage: 38000 },
  { id: "emp_off_5", name: "Pooja Shetty", designation: "Document Controller", department: "Legal & Admin", region: "mh", wage: 30000 },
  { id: "emp_off_6", name: "Saravanan Pillai", designation: "Purchase Officer", department: "Stores & Purchase", region: "south", wage: 36000 },
];
