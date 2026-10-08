import { z } from "zod";
import { gstinError, gstinPan, isValidPan } from "@/lib/gst-validation";

/** Zod schemas for the subcontractor server actions (a Party plus its Subcontractor row). */

const trimmed = (label: string) => z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`);
const optionalText = z.string().trim().optional().default("");

export const subcontractorFieldsSchema = z
  .object({
    name: trimmed("Name"),
    contactName: trimmed("Contact person"),
    phone: trimmed("Phone").refine((v) => /^[+\d][\d\s-]{6,}$/.test(v), "Phone is not valid"),
    email: optionalText.refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), "Email is not valid"),
    pan: trimmed("PAN")
      .transform((v) => v.toUpperCase())
      .refine(isValidPan, "PAN must look like ABCDE1234F (4th letter is the holder type, e.g. C company, F firm, P person)"),
    gstin: optionalText.transform((v) => v.toUpperCase()),
    address: optionalText,
    stateId: trimmed("State"),
    tradeCategory: trimmed("Trade category"),
    isLabourSupplier: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((v) => v === true || (typeof v === "string" && ["yes", "true", "1"].includes(v.trim().toLowerCase()))),
    status: z.enum(["ACTIVE", "INACTIVE", "BLACKLISTED"]).optional().default("ACTIVE"),
  })
  .superRefine((v, ctx) => {
    if (!v.gstin) return;
    const err = gstinError(v.gstin);
    if (err) ctx.addIssue({ code: "custom", path: ["gstin"], message: `GSTIN: ${err}` });
    else if (gstinPan(v.gstin) !== v.pan) {
      ctx.addIssue({ code: "custom", path: ["gstin"], message: `GSTIN contains PAN ${gstinPan(v.gstin)}, which differs from the PAN ${v.pan}` });
    }
  });

export const createSubcontractorSchema = subcontractorFieldsSchema;
export type CreateSubcontractorRaw = z.input<typeof createSubcontractorSchema>;

export const updateSubcontractorSchema = subcontractorFieldsSchema.safeExtend({
  id: trimmed("Subcontractor"),
  /** The version of the Subcontractor row the user loaded (optimistic locking). */
  version: z.number().int().positive(),
  reason: z.string().trim().optional(),
});
export type UpdateSubcontractorRaw = z.input<typeof updateSubcontractorSchema>;
