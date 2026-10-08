import { z } from "zod";
import { gstinError, gstinPan, gstinStateCode } from "@/lib/gst-validation";
import { STAGE_COLOR_TOKENS } from "./keys";

const id = z.string().min(1).max(60);
const name = (what: string) => z.string().trim().min(2, `Enter the ${what}`).max(120);
const reason = z.string().trim().max(500).optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-04-01");

export const setSettingSchema = z.object({ key: z.string().min(1).max(80), value: z.unknown(), reason });
export type SetSettingInput = z.infer<typeof setSettingSchema>;

export const setHealthSchema = z.object({ amber: z.number().min(0).max(100), red: z.number().min(0).max(100), reason });

export const regionSchema = z.object({
  id: id.optional(),
  name: name("region name"),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,12}$/, "Code is 2 to 12 letters or digits"),
  stateId: id,
  isActive: z.boolean().default(true),
});

export const officeSchema = z.object({
  id: id.optional(),
  regionId: id,
  name: name("office name"),
  kind: z.enum(["REGISTERED", "BRANCH", "REGIONAL", "SITE_OFFICE"]),
  address: z.string().trim().min(3, "Enter the address").max(400),
});

export const gstinSchema = z
  .object({
    id: id.optional(),
    gstin: z.string().trim().toUpperCase(),
    legalName: name("legal name"),
    tradeName: z.string().trim().max(120).optional(),
    stateId: id,
    panNumber: z.string().trim().toUpperCase(),
    address: z.string().trim().min(3, "Enter the address").max(400),
    regionId: id.optional(),
    isActive: z.boolean().default(true),
    isPlaceholder: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    // A placeholder GSTIN is a stand-in for one not yet issued: format-checked but the checksum is not enforced.
    const err = v.isPlaceholder ? null : gstinError(v.gstin);
    if (err) ctx.addIssue({ code: "custom", path: ["gstin"], message: err });
    if (!v.isPlaceholder && !err && gstinPan(v.gstin) !== v.panNumber) {
      ctx.addIssue({ code: "custom", path: ["panNumber"], message: "PAN must match the PAN inside the GSTIN" });
    }
    if (v.isPlaceholder && !/^\d{2}[A-Z0-9]{13}$/.test(v.gstin)) {
      ctx.addIssue({ code: "custom", path: ["gstin"], message: "A placeholder GSTIN still needs 15 characters starting with the state code" });
    }
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(v.panNumber) && !v.isPlaceholder) {
      ctx.addIssue({ code: "custom", path: ["panNumber"], message: "PAN format is not valid (expected AAAAA0000A)" });
    }
  });
export { gstinStateCode };

export const stageSchema = z.object({
  id: id.optional(),
  name: name("stage name"),
  kind: z.enum(["OPEN", "WON", "LOST", "NO_GO", "TERMINAL"]),
  color: z.enum(STAGE_COLOR_TOKENS).nullable().default(null),
  isActive: z.boolean().default(true),
});
export const reorderSchema = z.object({ orderedIds: z.array(id).min(1).max(200) });

export const checklistItemSchema = z.object({
  tenderTypeId: id,
  documentTypeId: id.optional(),
  newDocumentTypeName: z.string().trim().min(2).max(120).optional(),
  isMandatory: z.boolean().default(true),
});
export const checklistToggleSchema = z.object({ id, isMandatory: z.boolean() });
export const checklistRemoveSchema = z.object({ id });

export const serviceLineSchema = z.object({
  id: id.optional(),
  name: name("service line"),
  defaultUnit: z.string().trim().min(1, "Choose or type a unit").max(30),
  isActive: z.boolean().default(true),
});

export const deductionRateSchema = z.object({
  id,
  defaultRate: z.number().min(0, "Rate cannot be negative").max(100, "Rate cannot exceed 100%"),
  reason: z.string().trim().min(3, "Say why the default is changing").max(500),
});

export const projectStatusSchema = z.object({ id: id.optional(), name: name("status name"), isActive: z.boolean().default(true) });

export const statutoryRateSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,40}$/, "Code is capital letters, digits and underscores"),
  label: name("label"),
  unit: z.enum(["PERCENT", "AMOUNT_PER_DAY", "AMOUNT_PER_MONTH", "AMOUNT"]),
  value: z.number().min(0, "Value cannot be negative").max(10_000_000),
  effectiveFrom: isoDate,
  sourceNote: z.string().trim().max(400).optional(),
  regionId: id.optional(),
  category: z.string().trim().max(60).optional(),
  reason: z.string().trim().min(3, "Say why the rate is changing").max(500),
});
export const statutoryActiveSchema = z.object({ id, isActive: z.boolean(), reason: z.string().trim().min(3).max(500) });

export const approvalRulesSchema = z.object({
  makerChecker: z.boolean(),
  dueDays: z.number().int().min(0).max(30),
  required: z.record(z.string().max(60), z.boolean()),
  reason: z.string().trim().min(3, "Say why the approval rules are changing").max(500),
});

export const userUpdateSchema = z.object({
  id,
  name: name("name"),
  roleKey: z.string().min(1).max(40),
  isActive: z.boolean(),
});
export const userResetSchema = z.object({ id });
