import { z } from "zod";
import { isPeriodMonth } from "./readiness";

const period = z.string({ error: "Month is required" }).refine(isPeriodMonth, "Month must look like 2026-10");
const optionalText = z.string().trim().optional().transform((v) => v || null);
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v), "Date must be valid");

export const setCheckSchema = z.object({
  projectId: z.string().min(1),
  periodMonth: period,
  templateItemId: z.string().min(1),
  isDone: z.boolean(),
  doneOn: optionalDate,
  reference: optionalText,
  note: optionalText,
});

export const templateItemSchema = z.object({
  id: z.string().optional(),
  code: z
    .string({ error: "Code is required" })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,40}$/, "Code is letters, digits and underscores"),
  label: z.string({ error: "Label is required" }).trim().min(1, "Label is required"),
  isMandatory: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const seedTemplateSchema = z.object({});

export type SetCheckRaw = z.input<typeof setCheckSchema>;
export type TemplateItemRaw = z.input<typeof templateItemSchema>;
