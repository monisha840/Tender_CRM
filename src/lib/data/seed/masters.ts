import type { TenderStageKind } from "@/types";
import { meta, type SeedCtx } from "./helpers";

export type StageKey = "NEW" | "UNDER_EVALUATION" | "BID_PREPARING" | "SUBMITTED" | "WON" | "LOST";

/**
 * Default tender stages (client scope). Configurable data with a `systemKey` for code hooks.
 * "Under Evaluation" is where the GO / NO-GO decision is taken.
 */
export const STAGE_DEFS: { key: StageKey; name: string; kind: TenderStageKind }[] = [
  { key: "NEW", name: "New", kind: "OPEN" },
  { key: "UNDER_EVALUATION", name: "Under Evaluation", kind: "OPEN" },
  { key: "BID_PREPARING", name: "Bid Preparing", kind: "OPEN" },
  { key: "SUBMITTED", name: "Submitted", kind: "OPEN" },
  { key: "WON", name: "Won", kind: "WON" },
  { key: "LOST", name: "Lost", kind: "LOST" },
];
export const stageId = (key: StageKey) => `stg_${key.toLowerCase()}`;

export const TENDER_TYPES = ["Multi-year service contract", "Fixed-scope job", "Annual rate contract"] as const;
export const tenderTypeId = (i: number) => `ttype_${i + 1}`;

export const PORTALS = [
  { name: "NTPC e-Tender", url: "https://ntpctender.ntpc.co.in" },
  { name: "Central Public Procurement Portal", url: "https://eprocure.gov.in" },
  { name: "Mahatenders", url: "https://mahatenders.gov.in" },
  { name: "CG eProcurement", url: "https://eproc.cgstate.gov.in" },
  { name: "TN Tenders", url: "https://tntenders.gov.in" },
  { name: "Karnataka Public Procurement Portal", url: "https://kppp.karnataka.gov.in" },
] as const;
export const portalId = (i: number) => `portal_${i + 1}`;

export const DOC_TYPES = [
  "Company registration",
  "PAN card",
  "GST registration certificate",
  "EPF / ESI registration",
  "Solvency certificate",
  "Turnover certificate (CA)",
  "Experience certificates",
  "Affidavit / declaration",
  "Power of attorney",
  "Tender fee receipt",
  "EMD instrument",
  "Letter of Acceptance",
  "Agreement",
  "Bid acknowledgement",
  "Tender notice (NIT)",
  "Contract labour licence",
  "ISO / safety certificates",
  "Insurance policy",
  "Work order copy",
] as const;
export const docTypeId = (i: number) => `dtype_${i + 1}`;

export const EXPENSE_CATEGORIES = [
  { id: "ec_materials", name: "Materials" },
  { id: "ec_subcontract", name: "Subcontractors" },
  { id: "ec_labour", name: "Labour" },
  { id: "ec_equipment", name: "Equipment & fuel" },
  { id: "ec_overheads", name: "Site overheads" },
] as const;

export const DEDUCTION_TYPES = [
  { id: "ded_retention", code: "RETENTION", name: "Security deposit (retention)", method: "PERCENT", rate: "5.0000", applies: "BOTH", releasable: true },
  { id: "ded_tds_it", code: "TDS_IT", name: "Income-tax TDS", method: "PERCENT", rate: "2.0000", applies: "BOTH", releasable: false },
  { id: "ded_tds_gst", code: "TDS_GST", name: "GST TDS", method: "PERCENT", rate: "2.0000", applies: "RA_BILL", releasable: false },
  { id: "ded_cess", code: "LABOUR_CESS", name: "Labour cess", method: "PERCENT", rate: "1.0000", applies: "RA_BILL", releasable: false },
  { id: "ded_advance", code: "ADV_RECOVERY", name: "Advance recovery", method: "MANUAL", rate: null, applies: "BOTH", releasable: false },
  { id: "ded_material", code: "MAT_RECOVERY", name: "Material issued recovery", method: "MANUAL", rate: null, applies: "SUB_BILL", releasable: false },
  { id: "ded_penalty", code: "PENALTY", name: "Penalty / liquidated damages", method: "MANUAL", rate: null, applies: "BOTH", releasable: false },
] as const;

export const MATERIALS = [
  { id: "mat_primer", name: "Epoxy zinc-rich primer", unit: "litre", hsn: "3208" },
  { id: "mat_pu", name: "Polyurethane topcoat", unit: "litre", hsn: "3208" },
  { id: "mat_grit", name: "Abrasive grit for blasting", unit: "MT", hsn: "2505" },
  { id: "mat_sections", name: "Structural steel sections", unit: "MT", hsn: "7216" },
  { id: "mat_plate", name: "MS plates", unit: "MT", hsn: "7208" },
  { id: "mat_cbpipe", name: "Cast basalt lined pipe", unit: "running metre", hsn: "6815" },
  { id: "mat_cement", name: "Cement OPC 53 grade", unit: "bag", hsn: "2523" },
  { id: "mat_scaffold", name: "Scaffolding tubes and fittings", unit: "MT", hsn: "7306" },
  { id: "mat_ppe", name: "PPE and safety kit", unit: "set", hsn: "6307" },
  { id: "mat_electrode", name: "Welding electrodes", unit: "kg", hsn: "8311" },
] as const;

/**
 * Configurable service lines. `scope` and `eligibility` feed generated tender text
 * (unit is the default BOQ unit for the line).
 */
export const SERVICE_LINES = [
  {
    id: "sl_stone", key: "stone", name: "Stone Picking (manpower)", unit: "man-day",
    scope: "Deployment of trained manpower for stone and foreign-material picking from running coal conveyors, with supervision, PPE and statutory compliance",
    eligibility: "Similar manpower-supply work of at least 40% of the estimated value in a thermal power plant in the last 5 years; valid contract labour licence; EPF/ESI registration; average annual turnover of at least 30% of the estimate.",
  },
  {
    id: "sl_paint", key: "paint", name: "Industrial Painting & Coating", unit: "sq m",
    scope: "Surface preparation by blasting, application of epoxy primer, intermediate and polyurethane finish coats, with scaffolding and inspection",
    eligibility: "Completed industrial painting work of at least 40% of the estimated value in a power plant or process industry in the last 5 years; ISO 9001; trained applicators; average annual turnover of at least 30% of the estimate.",
  },
  {
    id: "sl_cbp", key: "cbp", name: "Cast Basalt Pipeline", unit: "running metre",
    scope: "Supply, laying and jointing of cast basalt lined pipeline for ash and slurry handling, including bends, supports and commissioning",
    eligibility: "Executed cast basalt or similar lined pipeline works of at least 50% of the estimated value; own or tied-up lining supply; valid solvency; average annual turnover of at least 30% of the estimate.",
  },
  {
    id: "sl_steel", key: "steel", name: "Steel Structure EPC", unit: "MT",
    scope: "Design, supply, fabrication, surface treatment and erection of structural steel, including civil foundations and painting",
    eligibility: "Executed structural steel fabrication and erection of at least 50% of the estimated value in the last 5 years; fabrication facility; ISO 9001 and 45001; average annual turnover of at least 30% of the estimate.",
  },
  {
    id: "sl_civil", key: "civil", name: "Civil Works", unit: "sq m",
    scope: "Civil, structural repair and finishing works including concrete, masonry, drains and allied works inside the plant",
    eligibility: "Similar civil works of at least 40% of the estimated value in the last 5 years; valid contractor licence; average annual turnover of at least 30% of the estimate.",
  },
  {
    id: "sl_scaff", key: "scaff", name: "Scaffolding", unit: "sq m",
    scope: "Supply, erection, dismantling and maintenance of scaffolding with rigging and safety nets for boiler, ESP and structure access",
    eligibility: "Scaffolding or rigging work of at least 40% of the estimated value in a power plant in the last 5 years; trained scaffolders and riggers; valid contract labour licence; average annual turnover of at least 30% of the estimate.",
  },
] as const;
export type ServiceLineKey = (typeof SERVICE_LINES)[number]["key"];
export const serviceLineId = (key: ServiceLineKey) => SERVICE_LINES.find((l) => l.key === key)!.id;

export function seedMasters({ db }: SeedCtx) {
  STAGE_DEFS.forEach((s, i) =>
    db.tenderStages.push({
      ...meta(stageId(s.key)),
      name: s.name,
      sequence: i + 1,
      kind: s.kind,
      systemKey: s.key,
      isActive: true,
    }),
  );
  db.tenderResults.push(
    { ...meta("res_won"), name: "Won", outcome: "WON", isActive: true },
    { ...meta("res_lost"), name: "Lost", outcome: "LOST", isActive: true },
    { ...meta("res_cancelled"), name: "Cancelled", outcome: "NEUTRAL", isActive: true },
    { ...meta("res_retender"), name: "Retender", outcome: "NEUTRAL", isActive: true },
  );
  TENDER_TYPES.forEach((name, i) => db.tenderTypes.push({ ...meta(tenderTypeId(i)), name, isActive: true }));
  PORTALS.forEach((p, i) => db.tenderPortals.push({ ...meta(portalId(i)), name: p.name, url: p.url }));
  DOC_TYPES.forEach((name, i) => db.documentTypes.push({ ...meta(docTypeId(i)), name, isActive: true }));

  [
    ["pst_mobilisation", "Mobilisation", "MOBILISATION"],
    ["pst_progress", "In progress", "IN_PROGRESS"],
    ["pst_hold", "On hold", "ON_HOLD"],
    ["pst_completed", "Completed", "COMPLETED"],
  ].forEach(([id, name, systemKey], i) =>
    db.projectStatuses.push({ ...meta(id), name, sequence: i + 1, systemKey, isActive: true }),
  );

  SERVICE_LINES.forEach((l) => db.serviceLines.push({ ...meta(l.id), name: l.name, defaultUnit: l.unit, isActive: true }));
  EXPENSE_CATEGORIES.forEach((c) => db.expenseCategories.push({ ...meta(c.id), name: c.name, isActive: true }));
  DEDUCTION_TYPES.forEach((d) =>
    db.deductionTypes.push({
      ...meta(d.id),
      code: d.code,
      name: d.name,
      calcMethod: d.method,
      defaultRate: d.rate,
      appliesTo: d.applies,
      isReleasable: d.releasable,
    }),
  );
  MATERIALS.forEach((m) => db.materials.push({ ...meta(m.id), name: m.name, unit: m.unit, hsn: m.hsn }));
  db.labourTypes.push(
    { ...meta("lt_monthly"), name: "Monthly staff", payrollMode: "MONTHLY", isActive: true },
    { ...meta("lt_daily"), name: "Daily-wage worker", payrollMode: "DAILY", isActive: true },
    { ...meta("lt_contract"), name: "Contract labour (via contractor)", payrollMode: "CONTRACTOR", isActive: true },
  );
}
