import { z } from "zod";
import { DATE_FORMATS } from "./parse";

const header = z.string().trim().max(120);

export const columnMapSchema = z.object({
  workerRef: header.min(1, "Choose the worker ID column"),
  workerName: header.nullish().or(z.literal("")),
  date: header.min(1, "Choose the date column"),
  inTime: header.nullish().or(z.literal("")),
  outTime: header.nullish().or(z.literal("")),
  hours: header.nullish().or(z.literal("")),
  shift: header.nullish().or(z.literal("")),
}).refine((m) => !!(m.hours || (m.inTime && m.outTime)), { message: "Map either the hours column or both in and out time", path: ["hours"] });

const dateFormat = z.enum(DATE_FORMATS);

export const saveMappingSchema = z.object({
  organisationId: z.string().min(1),
  name: z.string().trim().min(1, "Give the mapping a name").max(80),
  columnMap: columnMapSchema,
  dateFormat,
});
export type SaveMappingInput = z.infer<typeof saveMappingSchema>;

export const periodMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month");

export const uploadGateSchema = z.object({
  projectId: z.string().min(1, "Choose the project"),
  periodMonth: periodMonthSchema,
  fileName: z.string().trim().min(1).max(200),
  /** The file as a grid; the first row holds the column headers. */
  grid: z.array(z.array(z.string().max(400)).max(60)).min(2, "The file has no data rows").max(15000, "Too many rows for one upload (limit 15,000): split the file by month"),
  columnMap: columnMapSchema,
  dateFormat,
  /** Remember this mapping for the project's client organisation. */
  saveMapping: z.boolean().default(false),
});
export type UploadGateInput = z.infer<typeof uploadGateSchema>;

export const RESOLUTIONS = {
  CORRECTED_OURS: "We corrected our attendance",
  CLIENT_TO_CORRECT: "Client to correct their record",
  ACCEPTED: "Accepted as is",
} as const;
export type ResolutionCode = keyof typeof RESOLUTIONS;

export const resolveExceptionSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1),
  resolution: z.enum(["CORRECTED_OURS", "CLIENT_TO_CORRECT", "ACCEPTED"]),
  reason: z.string().trim().min(3, "Say why in a few words"),
});
export type ResolveExceptionInput = z.infer<typeof resolveExceptionSchema>;

export const detailSchema = z.object({ uploadId: z.string().min(1) });
