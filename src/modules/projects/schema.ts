import { z } from "zod";
import { parseDate, parseMoney } from "../work-entry-utils";

/** Zod schemas for the project server actions. Strings in (as typed in the form), normalised values out (money "123.00", dates ISO). */

const trimmed = (label: string) => z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`);
const optionalText = z.string().trim().optional().default("");

const positiveMoney = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .transform((v, ctx) => {
      const m = parseMoney(v);
      if (m === undefined || Number(m) <= 0) {
        ctx.addIssue({ code: "custom", message: `${label} must be a number greater than 0` });
        return z.NEVER;
      }
      return m;
    });

const date = (label: string, required: boolean) =>
  z
    .string()
    .trim()
    .optional()
    .default("")
    .transform((v, ctx) => {
      const d = parseDate(v);
      if (d === undefined) {
        ctx.addIssue({ code: "custom", message: `${label} is not a valid date (use DD-MM-YYYY)` });
        return z.NEVER;
      }
      if (d === null && required) {
        ctx.addIssue({ code: "custom", message: `${label} is required` });
        return z.NEVER;
      }
      return d;
    });

export const projectFieldsSchema = z
  .object({
    name: trimmed("Project name"),
    siteId: trimmed("Plant site"),
    serviceLineId: trimmed("Service line"),
    contractType: z.enum(["SERVICE", "FIXED_SCOPE"], { error: "Contract type is required" }),
    billingCycle: z.enum(["MONTHLY", "MILESTONE", "ON_COMPLETION"], { error: "Billing cycle is required" }),
    workOrderNo: optionalText,
    workOrderDate: date("Work order date", false),
    paymentTermsDays: z
      .string()
      .trim()
      .optional()
      .default("")
      .transform((v, ctx) => {
        if (!v) return 30;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 365) {
          ctx.addIssue({ code: "custom", message: "Payment terms must be a whole number of days (0-365)" });
          return z.NEVER;
        }
        return n;
      }),
    contractValue: positiveMoney("Contract value"),
    startDate: date("Start date", false),
    plannedEndDate: date("Planned end date", false),
    /** Blank means the default GSTIN of the site's region. */
    gstRegistrationId: optionalText,
    statusId: optionalText,
    projectManagerId: optionalText,
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.plannedEndDate && v.plannedEndDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["plannedEndDate"], message: "Planned end date is before the start date" });
    }
  });

export const createProjectSchema = projectFieldsSchema;
export type CreateProjectRaw = z.input<typeof createProjectSchema>;

export const updateProjectSchema = projectFieldsSchema.safeExtend({
  id: trimmed("Project"),
  /** The version the user loaded (optimistic locking). */
  version: z.number().int().positive(),
  /** Required when the contract value changes. */
  reason: z.string().trim().optional(),
});
export type UpdateProjectRaw = z.input<typeof updateProjectSchema>;
