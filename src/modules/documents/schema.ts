import { z } from "zod";

const isoDate = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date`)
    .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, `${label} must be a valid date`);
const optionalDate = (label: string) =>
  z
    .union([z.literal(""), isoDate(label)])
    .optional()
    .transform((v) => v || null);
const optionalText = z.string().trim().optional().transform((v) => v || null);

const fields = {
  documentTypeId: z.string({ error: "Document type is required" }).trim().min(1, "Document type is required"),
  title: z.string({ error: "Title is required" }).trim().min(1, "Title is required"),
  referenceNo: optionalText,
  issueDate: optionalDate("Issue date"),
  expiryDate: optionalDate("Expiry date"),
  /** Placeholder until storage is wired: the file name or where the scan is kept. */
  fileRef: optionalText,
  notes: optionalText,
};

const datesInOrder = (v: { issueDate: string | null; expiryDate: string | null }) => !v.issueDate || !v.expiryDate || v.expiryDate >= v.issueDate;
const ORDER_MSG = { message: "Expiry date cannot be before the issue date", path: ["expiryDate"] };

export const createDocumentSchema = z.object(fields).refine(datesInOrder, ORDER_MSG);
export const updateDocumentSchema = z.object({ id: z.string().min(1), version: z.number().int(), ...fields }).refine(datesInOrder, ORDER_MSG);
/** Replace = a renewed certificate: new reference and dates on the same row; the old values stay in the audit trail. */
export const replaceDocumentSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int(),
    referenceNo: optionalText,
    issueDate: optionalDate("Issue date"),
    expiryDate: optionalDate("Expiry date"),
    fileRef: optionalText,
    reason: z.string({ error: "Say why this is being replaced" }).trim().min(1, "Say why this is being replaced"),
  })
  .refine(datesInOrder, ORDER_MSG);
export const deleteDocumentSchema = z.object({ id: z.string().min(1), version: z.number().int(), reason: z.string().trim().min(1, "A reason is required") });
export const tenderIdSchema = z.object({ tenderId: z.string().min(1) });

export type CreateDocumentRaw = z.input<typeof createDocumentSchema>;
export type UpdateDocumentRaw = z.input<typeof updateDocumentSchema>;
export type ReplaceDocumentRaw = z.input<typeof replaceDocumentSchema>;
