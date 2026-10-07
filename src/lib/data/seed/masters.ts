import type { TenderStageKind } from "@/types";
import { meta, type SeedCtx } from "./helpers";

export type StageKey =
  | "IDENTIFIED"
  | "REGISTERED"
  | "GO_NO_GO_PENDING"
  | "NO_GO"
  | "PREPARATION"
  | "EMD_ARRANGED"
  | "SUBMITTED"
  | "TECHNICAL_EVALUATION"
  | "FINANCIAL_EVALUATION"
  | "WON"
  | "LOST"
  | "CANCELLED"
  | "AWARDED"
  | "AGREEMENT_SIGNED"
  | "CONVERTED_TO_PROJECT";

/** Default tender stages (docs/system-flow.md §3.3). Configurable data, with `systemKey` for code hooks. */
export const STAGE_DEFS: { key: StageKey; name: string; kind: TenderStageKind }[] = [
  { key: "IDENTIFIED", name: "Identified", kind: "OPEN" },
  { key: "REGISTERED", name: "Registered", kind: "OPEN" },
  { key: "GO_NO_GO_PENDING", name: "GO / NO-GO pending", kind: "OPEN" },
  { key: "NO_GO", name: "No-Go", kind: "NO_GO" },
  { key: "PREPARATION", name: "Preparation", kind: "OPEN" },
  { key: "EMD_ARRANGED", name: "EMD arranged", kind: "OPEN" },
  { key: "SUBMITTED", name: "Submitted", kind: "OPEN" },
  { key: "TECHNICAL_EVALUATION", name: "Technical evaluation", kind: "OPEN" },
  { key: "FINANCIAL_EVALUATION", name: "Financial evaluation", kind: "OPEN" },
  { key: "WON", name: "Won", kind: "WON" },
  { key: "LOST", name: "Lost", kind: "LOST" },
  { key: "CANCELLED", name: "Cancelled", kind: "TERMINAL" },
  { key: "AWARDED", name: "Awarded", kind: "WON" },
  { key: "AGREEMENT_SIGNED", name: "Agreement signed", kind: "WON" },
  { key: "CONVERTED_TO_PROJECT", name: "Converted to project", kind: "WON" },
];
export const stageId = (key: StageKey) => `stg_${key.toLowerCase()}`;

export const TENDER_TYPES = [
  "Roads",
  "Buildings",
  "Water supply & sewerage",
  "Drainage",
  "Electrical & substations",
  "Bridges & culverts",
  "Landscaping & public amenities",
] as const;
export const tenderTypeId = (i: number) => `ttype_${i + 1}`;

export const PORTALS = [
  { name: "CG eProcurement", url: "https://eproc.cgstate.gov.in" },
  { name: "Delhi eProcurement", url: "https://govtprocurement.delhi.gov.in" },
  { name: "Mahatenders", url: "https://mahatenders.gov.in" },
  { name: "Central Public Procurement Portal", url: "https://eprocure.gov.in" },
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
  { id: "ded_retention", code: "RETENTION", name: "Retention / security deposit", method: "PERCENT", rate: "5.0000", applies: "BOTH", releasable: true },
  { id: "ded_tds_it", code: "TDS_IT", name: "Income-tax TDS", method: "PERCENT", rate: "2.0000", applies: "BOTH", releasable: false },
  { id: "ded_tds_gst", code: "TDS_GST", name: "GST TDS", method: "PERCENT", rate: "2.0000", applies: "RA_BILL", releasable: false },
  { id: "ded_cess", code: "LABOUR_CESS", name: "Labour cess", method: "PERCENT", rate: "1.0000", applies: "RA_BILL", releasable: false },
  { id: "ded_advance", code: "ADV_RECOVERY", name: "Advance recovery", method: "MANUAL", rate: null, applies: "BOTH", releasable: false },
  { id: "ded_material", code: "MAT_RECOVERY", name: "Material issued recovery", method: "MANUAL", rate: null, applies: "SUB_BILL", releasable: false },
  { id: "ded_penalty", code: "PENALTY", name: "Penalty / liquidated damages", method: "MANUAL", rate: null, applies: "BOTH", releasable: false },
] as const;

export const MATERIALS = [
  { id: "mat_cement", name: "Cement OPC 53 grade", unit: "bag", hsn: "2523" },
  { id: "mat_steel", name: "TMT steel Fe500D", unit: "kg", hsn: "7214" },
  { id: "mat_bitumen", name: "Bitumen VG-30", unit: "MT", hsn: "2713" },
  { id: "mat_agg20", name: "Aggregate 20 mm", unit: "cum", hsn: "2517" },
  { id: "mat_sand", name: "River sand", unit: "cum", hsn: "2505" },
  { id: "mat_gsb", name: "GSB / WMM material", unit: "cum", hsn: "2517" },
  { id: "mat_pipe", name: "DI pipe 300 mm", unit: "m", hsn: "7303" },
  { id: "mat_brick", name: "Fly-ash bricks", unit: "nos", hsn: "6901" },
  { id: "mat_rmc", name: "Ready-mix concrete M25", unit: "cum", hsn: "3824" },
  { id: "mat_diesel", name: "HSD diesel", unit: "litre", hsn: "2710" },
] as const;

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
