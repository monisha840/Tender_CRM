import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").optional();

/** Input for "mark refund requested" and "mark released". A reason is mandatory (money movement). */
export const instrumentActionSchema = z.object({
  instrumentId: z.string().min(1, "Instrument is required"),
  version: z.number().int().positive(),
  reason: z.string().trim().min(1, "A reason is required"),
  date: isoDate,
  reference: z.string().trim().max(200).optional(),
});
export type InstrumentActionInput = z.input<typeof instrumentActionSchema>;
