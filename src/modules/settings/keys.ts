/**
 * Well-known Setting keys with typed defaults. The single source of truth for every non-table setting:
 * other packages read them with `getSettingValue(KEY, DEFAULT)` (src/lib/server/settings-read.ts) or from the
 * client-safe runtime snapshot (./runtime.ts). Pure module: no I/O, safe to import anywhere.
 */
import { z } from "zod";

export const SETTING_KEYS = {
  companyProfile: "company.profile",
  remindersEnabled: "reminders.enabled",
  deadlineDays: "reminders.deadlineDays",
  documentExpiryDays: "reminders.documentExpiryDays",
  moneyLockedExpiryDays: "reminders.moneyLockedExpiryDays",
  healthAmberDelayPct: "health.amberDelayPct",
  healthRedDelayPct: "health.redDelayPct",
  billingDefaultGstPct: "billing.defaultGstPct",
  billingPaymentTermsDays: "billing.paymentTermsDays",
  pnlLowMarginPct: "pnl.lowMarginPct",
  approvalsMakerChecker: "approvals.makerChecker",
  approvalsDueDays: "approvals.dueDays",
  approvalsRequired: "approvals.required",
  catalogUnits: "catalog.units",
  gstPlaceholderIds: "gst.placeholderIds",
} as const;

/** Feature toggle modules. `features.<module>` holds a boolean. */
export const FEATURE_MODULES = [
  "daily_work",
  "finance_gst",
  "payroll",
  "money_locked",
  "contract_pnl",
  "documents",
  "bill_readiness",
  "gate_reconciliation",
  "bid_pricing",
] as const;
export type FeatureModule = (typeof FEATURE_MODULES)[number];

export const FEATURE_LABEL: Record<FeatureModule, { label: string; hint: string }> = {
  daily_work: { label: "Daily work", hint: "Daily work reports, site issues and photos." },
  finance_gst: { label: "Finance and GST", hint: "Invoices, receipts, GST returns and accounts screens." },
  payroll: { label: "Employees and payroll", hint: "Employees, attendance, payroll runs and EPF/ESI." },
  money_locked: { label: "Money locked", hint: "EMD, PBG and security deposits locked with customers." },
  contract_pnl: { label: "Contract P&L", hint: "Profit and loss per contract with low-margin alerts." },
  documents: { label: "Company documents", hint: "Certificate vault with expiry alerts." },
  bill_readiness: { label: "Bill readiness", hint: "Checklist that confirms a bill is ready to raise." },
  gate_reconciliation: { label: "Gate reconciliation", hint: "Gate attendance upload matched against our attendance." },
  bid_pricing: { label: "Bid pricing", hint: "Costing and pricing sheets while preparing a bid." },
};

export const featureKey = (m: FeatureModule): string => `features.${m}`;

/** Modules that the NEXT_PUBLIC_FEATURE_FINANCE_PAYROLL env flag overrides when it is explicitly true/false. */
export const PHASE67_FEATURES: readonly FeatureModule[] = ["daily_work", "finance_gst", "payroll"];

/** Display colour tokens a tender stage may use (token names, never hex). */
export const STAGE_COLOR_TOKENS = ["neutral", "accent", "success", "warning", "danger"] as const;
export type StageColorToken = (typeof STAGE_COLOR_TOKENS)[number];

const dayList = (min: number, max: number) =>
  z
    .array(z.number().int().min(min, `Each day count must be at least ${min}`).max(max, `Each day count must be at most ${max}`))
    .min(1, "Add at least one value")
    .max(8, "At most 8 values")
    .refine((a) => new Set(a).size === a.length, "Values must be unique")
    .transform((a) => [...a].sort((x, y) => y - x));

export const companyProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter the company name").max(120),
  logoUrl: z.string().trim().max(500).refine((v) => v === "" || /^(https?:\/\/|\/)/.test(v), "Use a web address (https://...) or a path starting with /"),
  address: z.string().trim().max(400),
  phone: z.string().trim().max(40),
  email: z.string().trim().max(120).refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid email"),
  cin: z.string().trim().max(30),
  pan: z.string().trim().max(10),
});
export type CompanyProfile = z.infer<typeof companyProfileSchema>;

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  name: "S. Prince Hightech Pvt. Ltd.",
  logoUrl: "",
  address: "",
  phone: "",
  email: "",
  cin: "",
  pan: "",
};

const pct = (label: string) => z.number().min(0, `${label} cannot be negative`).max(100, `${label} cannot exceed 100`);

/** Per-key definition: Zod schema (validates writes and sanitises reads) and the default value. */
type Def = { schema: z.ZodType<unknown>; default: unknown; label: string; unit?: string };
function def(schema: z.ZodType<unknown>, d: unknown, label: string, unit?: string): Def {
  return { schema, default: d, label, unit };
}

const featureDefs: Record<string, Def> = Object.fromEntries(
  FEATURE_MODULES.map((m) => [featureKey(m), def(z.boolean(), true, FEATURE_LABEL[m].label)]),
);

export const SETTING_DEFS: Record<string, Def> = {
  [SETTING_KEYS.companyProfile]: def(companyProfileSchema, DEFAULT_COMPANY_PROFILE, "Company profile"),
  [SETTING_KEYS.remindersEnabled]: def(z.boolean(), true, "Reminders on"),
  [SETTING_KEYS.deadlineDays]: def(dayList(0, 90), [7, 3, 1], "Tender deadline reminders", "days before"),
  [SETTING_KEYS.documentExpiryDays]: def(dayList(0, 365), [60, 30, 7], "Document expiry alerts", "days before"),
  [SETTING_KEYS.moneyLockedExpiryDays]: def(dayList(0, 365), [30, 15, 7], "Money locked expiry alerts", "days before"),
  [SETTING_KEYS.healthAmberDelayPct]: def(pct("Amber threshold"), 5, "Amber when behind plan by", "% points"),
  [SETTING_KEYS.healthRedDelayPct]: def(pct("Red threshold"), 15, "Red when behind plan by", "% points"),
  [SETTING_KEYS.billingDefaultGstPct]: def(z.number().min(0).max(40, "GST cannot exceed 40%"), 18, "Default GST rate", "%"),
  [SETTING_KEYS.billingPaymentTermsDays]: def(z.number().int().min(0).max(365), 30, "Default payment terms", "days"),
  [SETTING_KEYS.pnlLowMarginPct]: def(pct("Low margin"), 10, "Low margin warning below", "%"),
  [SETTING_KEYS.approvalsMakerChecker]: def(z.boolean(), true, "Maker-checker (requester cannot approve own request)"),
  [SETTING_KEYS.approvalsDueDays]: def(z.number().int().min(0).max(30), 2, "Approval due after", "days"),
  [SETTING_KEYS.approvalsRequired]: def(z.record(z.string().max(60), z.boolean()), {}, "Actions needing Director approval"),
  [SETTING_KEYS.catalogUnits]: def(
    z.array(z.string().trim().min(1).max(30)).min(1).max(30).refine((a) => new Set(a.map((x) => x.toLowerCase())).size === a.length, "Units must be unique"),
    ["man-day", "sq m", "running metre", "MT"],
    "Measurement units",
  ),
  [SETTING_KEYS.gstPlaceholderIds]: def(z.array(z.string().max(60)), [], "Placeholder GSTINs"),
  ...featureDefs,
};

export const isKnownSettingKey = (key: string): boolean => Object.prototype.hasOwnProperty.call(SETTING_DEFS, key);

export function settingDefault<T = unknown>(key: string): T {
  return SETTING_DEFS[key]?.default as T;
}

/** Parse a stored value; returns the default when the key is unknown, unset or invalid (a bad row never breaks the app). */
export function parseSetting<T = unknown>(key: string, stored: unknown): T {
  const d = SETTING_DEFS[key];
  if (!d) return stored as T;
  if (stored === undefined || stored === null) return d.default as T;
  const r = d.schema.safeParse(stored);
  return (r.success ? r.data : d.default) as T;
}

/** Validate a write. Returns the cleaned value or the first error message. */
export function validateSetting(key: string, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  const d = SETTING_DEFS[key];
  if (!d) return { ok: false, error: `Unknown setting ${key}` };
  const r = d.schema.safeParse(value);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Invalid value" };
  return { ok: true, value: r.data };
}

/** Cross-field rule: amber must be below red. */
export function healthThresholdError(amber: number, red: number): string | null {
  return amber < red ? null : "Amber threshold must be lower than the red threshold";
}

/** Parse "7, 3, 1" into numbers; non-numeric tokens become NaN so the caller can show an error. */
export function parseDayList(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((t) => (/^\d+$/.test(t) ? Number(t) : Number.NaN));
}
