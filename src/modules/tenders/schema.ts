import { z } from "zod";
import { parseDateTime, parseMoney } from "./entry";

/** Zod schemas for every tender server action. Strings in, normalised strings out (money "123.00", dates ISO). */

const trimmed = (label: string) => z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`);
const optionalText = z.string().trim().optional().default("");
const reasonText = z.string().trim().optional();

const money = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .default("")
    .transform((v, ctx) => {
      const m = parseMoney(v, label);
      if (typeof m !== "string") {
        ctx.addIssue({ code: "custom", message: m.error });
        return z.NEVER;
      }
      return m;
    });

const dateTime = (label: string, required: boolean) =>
  z
    .string()
    .trim()
    .optional()
    .default("")
    .transform((v, ctx) => {
      if (!v) {
        if (required) ctx.addIssue({ code: "custom", message: `${label} is required` });
        return null;
      }
      const p = parseDateTime(v);
      if (!p) {
        ctx.addIssue({ code: "custom", message: `${label} is not a valid date (use DD-MM-YYYY or DD-MM-YYYY HH:mm)` });
        return z.NEVER;
      }
      return p;
    });

export const tenderFieldsSchema = z.object({
  tenderNo: trimmed("Tender no"),
  title: trimmed("Title"),
  organisationId: trimmed("Organisation"),
  serviceLineId: trimmed("Service line"),
  regionId: trimmed("Region"),
  tenderTypeId: trimmed("Tender type"),
  location: optionalText,
  workDescription: optionalText,
  estimatedValue: money("Estimated value"),
  emdAmount: money("EMD"),
  tenderFee: money("Tender fee"),
  submissionDeadline: dateTime("Submission deadline", true),
  openingDate: dateTime("Opening date", false),
  /** Defaults to the signed-in user. */
  ownerId: z.string().trim().optional(),
});

export const createTenderSchema = tenderFieldsSchema;
export type CreateTenderInput = z.infer<typeof createTenderSchema>;
/** Raw (pre-parse) shape the UI sends. */
export type CreateTenderRaw = z.input<typeof createTenderSchema>;

export const updateTenderSchema = tenderFieldsSchema.extend({
  id: trimmed("Tender"),
  /** The version the user loaded (optimistic locking). */
  version: z.number().int().positive(),
  /** Required when an amount (estimated value, EMD, fee) changes. */
  reason: reasonText,
});
export type UpdateTenderInput = z.infer<typeof updateTenderSchema>;
export type UpdateTenderRaw = z.input<typeof updateTenderSchema>;

export const deleteTenderSchema = z.object({
  id: trimmed("Tender"),
  version: z.number().int().positive(),
  reason: z.string({ error: "A reason is required" }).trim().min(3, "A reason is required"),
});

export const moveStageSchema = z.object({
  id: trimmed("Tender"),
  toStageId: trimmed("Stage"),
  version: z.number().int().positive(),
  /** Required when moving backwards. */
  reason: reasonText,
});

export const goNoGoRequestSchema = z
  .object({
    id: trimmed("Tender"),
    recommendation: z.enum(["GO", "NO_GO"]).default("GO"),
    /** Required for NO-GO; optional note for GO. */
    reason: reasonText,
  })
  .superRefine((v, ctx) => {
    if (v.recommendation === "NO_GO" && !v.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "A NO-GO needs a reason" });
  });

export const resultSchema = z.object({
  id: trimmed("Tender"),
  version: z.number().int().positive(),
  reason: z.string({ error: "A reason is required" }).trim().min(3, "A reason is required"),
});

export const conversionRequestSchema = z.object({
  id: trimmed("Tender"),
  /** Required when mandatory award conditions are still open. */
  overrideReason: reasonText,
});
