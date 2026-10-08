import { z } from "zod";

const money = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter an amount in rupees");
const pct = z.number().min(0, "Cannot be negative").max(100, "Cannot exceed 100");

export const pricingContextSchema = z.object({
  tenderId: z.string().min(1),
  /** Wage category to look the minimum wage up for (blank = the generic / unskilled row). */
  category: z.string().trim().max(60).nullish(),
  /** YYYY-MM-DD the statutory rates must be valid on; defaults to the tender's opening date. */
  rateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});
export type PricingContextInput = z.infer<typeof pricingContextSchema>;

export const savePricingSchema = z.object({
  tenderId: z.string().min(1),
  manpower: z.number().int().min(1, "At least 1 person").max(100000),
  days: z.number().int().min(1, "At least 1 day").max(3650),
  wageCategory: z.string().trim().max(60).nullish(),
  rateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  /** Planned wage per day; blank = the statutory minimum. */
  dailyWage: money.nullish().or(z.literal("")),
  pfPct: pct,
  esiPct: pct,
  bonusPct: pct,
  esiApplicable: z.boolean().default(true),
  overheadPct: pct,
  marginPct: z.number().min(0).max(99, "Margin must be under 100%"),
  quotedPrice: money.nullish().or(z.literal("")),
});
export type SavePricingInput = z.infer<typeof savePricingSchema>;
