import { addDays, getToday } from "@/lib/dates";
import { addMoney, cmpMoney, fromPaise, isPositive, splitGst, splitTaxAmount, subMoney, toPaise } from "@/lib/money";
import { byId } from "@/lib/data/shared";
import { gstinError, gstinPan, gstinStateCode, makeGstin } from "@/lib/gst-validation";
import { parseDate } from "../work-entry-utils";
import { formatInvoiceNo, invoiceNoError, invoiceSeriesPrefix, latestSequence } from "./numbering";
import type { Database, GstFilingStatus, GstRegistration, GstTransaction, Invoice, InvoiceDeduction, InvoiceType, Money, Project, RetentionEntry } from "@/types";

export interface InvoiceEntry {
  /** Blank means "the project's GSTIN". */
  gstRegistrationId: string;
  organisationId: string;
  projectId: string;
  invoiceNo: string;
  invoiceDate: string;
  invoiceType: InvoiceType;
  periodFrom: string;
  periodTo: string;
  taxableValue: string;
  gstPercent: string;
  deductions: string;
  deductionTypeId: string;
}

export const INVOICE_TYPES: InvoiceType[] = ["MONTHLY", "MILESTONE", "FINAL"];

export const INVOICE_HEADERS = ["Invoice no", "Invoice date", "GSTIN", "Customer", "Project", "Type", "Period from", "Period to", "Taxable value", "GST %", "Deductions", "Deduction type"];

/** Unique-enough id for rows created in the browser. */
export const newId = (prefix: string): string => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

/** Parses "1,23,456.5" into a normalised money string, or null when invalid or negative. */
export function parseMoney(raw: string): Money | null {
  const s = raw.replace(/[,₹\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return fromPaise(toPaise(s));
}

/** 11th of the month after the invoice date. */
export function gstFilingDue(invoiceDate: string): string {
  const [y, m] = invoiceDate.split("-").map(Number);
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-11`;
}

/** The GSTIN an invoice for this project is raised from: the project's own, else the default one for its region. */
export function defaultGstRegistrationId(db: Database, project: Pick<Project, "gstRegistrationId" | "regionId">): string {
  if (project.gstRegistrationId) return project.gstRegistrationId;
  const links = db.regionGstRegistrations.filter((r) => r.regionId === project.regionId && !r.deletedAt);
  return (links.find((r) => r.isDefault) ?? links[0])?.gstRegistrationId ?? "";
}

/** Error text when `reg` does not fit the project (a GSTIN of another state than the project's), else null. */
export function gstinFitError(db: Database, reg: GstRegistration, project: Project): string | null {
  const expectedId = defaultGstRegistrationId(db, project);
  if (!expectedId || reg.id === expectedId) return null;
  const expected = byId(db.gstRegistrations, expectedId);
  if (expected && expected.stateId === reg.stateId) return null; // another registration in the same state
  const stateOf = (r: GstRegistration) => byId(db.states, r.stateId)?.name ?? r.stateId;
  return `GSTIN ${reg.gstin} (${stateOf(reg)}) does not fit project "${project.name}", which bills from ${expected?.gstin ?? expectedId}${expected ? ` (${stateOf(expected)})` : ""}`;
}

/**
 * Next invoice number for a GSTIN: one series per GSTIN per financial year (April to March), restarting at 0001 each year.
 * The latest is picked by numeric sequence. `pendingNos` are "gstRegId|number" keys saved earlier in the same import.
 */
export function suggestInvoiceNo(db: Database, gstRegistrationId: string, invoiceDate = getToday(), pendingNos: string[] = []): string {
  const reg = byId(db.gstRegistrations, gstRegistrationId);
  const stateCode = (reg && byId(db.states, reg.stateId)?.code) || "XX";
  const prefix = invoiceSeriesPrefix(stateCode, invoiceDate);
  const used = db.invoices.filter((i) => i.gstRegistrationId === gstRegistrationId && !i.deletedAt).map((i) => i.invoiceNo.toUpperCase());
  for (const key of pendingNos) if (key.startsWith(`${gstRegistrationId}|`)) used.push(key.slice(gstRegistrationId.length + 1).toUpperCase());
  return formatInvoiceNo(prefix, latestSequence(used, prefix) + 1);
}

/** Customer GSTIN for the plant state: the organisation's own when it is registered there, else the one for that state under the same PAN. */
export function customerGstinFor(orgGstin: string, placeOfSupplyStateCode: string): string {
  const g = orgGstin.trim().toUpperCase();
  return gstinStateCode(g) === placeOfSupplyStateCode ? g : makeGstin(placeOfSupplyStateCode, gstinPan(g));
}

export type BuildResult =
  | {
      ok: true;
      invoice: Invoice;
      deductions: InvoiceDeduction[];
      gstTransaction: GstTransaction;
      /** Written when a retention deduction is taken (B7). */
      retentionEntries: RetentionEntry[];
      /** GST-TDS deducted by the customer, as a TDS_RECEIVED row (B7). */
      tdsTransactions: GstTransaction[];
    }
  | { ok: false; error: string };

const STRICT_PERCENT = /^\d+(\.\d{1,2})?$/;

/** Validates an entry and computes tax split, totals, due dates and statuses. Used by the form and the CSV import. */
export function buildInvoice(db: Database, e: InvoiceEntry, pendingNos: string[] = [], now = new Date().toISOString()): BuildResult {
  const fail = (error: string): BuildResult => ({ ok: false, error });
  const org = byId(db.organisations, e.organisationId);
  if (!org) return fail("Customer organisation not found");
  const project = byId(db.projects, e.projectId);
  if (!project) return fail("Project not found");
  if (project.organisationId !== org.id) return fail(`Project "${project.name}" belongs to a different customer`);
  const reg = byId(db.gstRegistrations, e.gstRegistrationId || defaultGstRegistrationId(db, project));
  if (!reg) return fail("GSTIN not found");
  const fit = gstinFitError(db, reg, project);
  if (fit) return fail(fit);

  const no = e.invoiceNo.trim();
  if (!no) return fail("Invoice number is required");
  const noErr = invoiceNoError(no);
  if (noErr) return fail(noErr);
  const key = `${reg.id}|${no.toLowerCase()}`;
  if (pendingNos.includes(key) || db.invoices.some((i) => !i.deletedAt && i.gstRegistrationId === reg.id && i.invoiceNo.toLowerCase() === no.toLowerCase()))
    return fail(`Invoice number ${no} already exists for this GSTIN`);

  const invoiceDate = parseDate(e.invoiceDate);
  if (!invoiceDate) return fail("Invoice date is missing or not a real date (use DD-MM-YYYY or YYYY-MM-DD)");
  if (!INVOICE_TYPES.includes(e.invoiceType)) return fail("Type must be MONTHLY, MILESTONE or FINAL");
  // parseDate: null = blank (defaults to the invoice date), undefined = not a real date.
  const from = parseDate(e.periodFrom);
  const to = parseDate(e.periodTo);
  if (from === undefined || to === undefined) return fail("Period dates must be real dates (DD-MM-YYYY or YYYY-MM-DD)");
  const periodFrom = from ?? invoiceDate;
  const periodTo = to ?? invoiceDate;
  if (periodTo < periodFrom) return fail("Period end is before period start");
  const taxable = parseMoney(e.taxableValue);
  if (!taxable || !isPositive(taxable)) return fail("Taxable value must be a positive amount");
  const pct = e.gstPercent.trim() === "" ? "18" : e.gstPercent.trim();
  const rate = STRICT_PERCENT.test(pct) ? Number(pct) : NaN;
  if (!Number.isFinite(rate) || rate > 40) return fail("GST % must be between 0 and 40");
  const ded = e.deductions.trim() === "" ? "0.00" : parseMoney(e.deductions);
  if (ded === null) return fail("Deductions must be a valid amount");

  // B1: a B2B invoice needs the customer's GSTIN; "UNREGISTERED" is never saved silently.
  const orgGstin = (org.gstin ?? "").trim();
  if (!orgGstin) return fail(`${org.name} has no GSTIN on record. Add it to the customer before invoicing`);
  const orgGstinErr = gstinError(orgGstin);
  if (orgGstinErr) return fail(`${org.name}: ${orgGstinErr}`);

  // Place of supply is the plant site's state, as in the seeded invoices; same state as our GSTIN => CGST + SGST.
  const placeOfSupply = byId(db.sites, project.siteId)?.stateId ?? org.stateId;
  const intra = placeOfSupply === reg.stateId;
  const supplyStateCode = byId(db.states, placeOfSupply)?.gstStateCode ?? gstinStateCode(orgGstin);
  const customerGstin = customerGstinFor(orgGstin, supplyStateCode);
  const { tax: gst, cgst, sgst, igst } = splitGst(taxable, rate, intra);
  const total = addMoney(taxable, gst);
  if (cmpMoney(ded, total) > 0) return fail("Deductions exceed the invoice total");
  const net = subMoney(total, ded);
  const id = `inv_new_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
  const gstFilingStatus: GstFilingStatus = "PENDING";
  const invoice: Invoice = {
    id,
    createdAt: now,
    updatedAt: now,
    gstRegistrationId: reg.id,
    invoiceNo: no,
    invoiceDate,
    organisationId: org.id,
    customerGstin,
    projectId: project.id,
    regionId: project.regionId,
    invoiceType: e.invoiceType,
    periodFrom,
    periodTo,
    taxableValue: taxable,
    cgst,
    sgst,
    igst,
    total,
    totalDeductions: ded,
    netReceivable: net,
    receivedAmount: "0.00",
    dueDate: addDays(invoiceDate, project.paymentTermsDays),
    paymentStatus: "UNPAID",
    gstFilingStatus,
    filingReference: null,
    gstFilingDueDate: gstFilingDue(invoiceDate),
  };
  const deductionTypeId = e.deductionTypeId || "ded_tds_it";
  const deductions: InvoiceDeduction[] = isPositive(ded)
    ? [{ id: `ivd_${id}_1`, createdAt: now, updatedAt: now, invoiceId: id, deductionTypeId, amount: ded }]
    : [];
  const gstTransaction: GstTransaction = {
    id: `gst_${id}`,
    createdAt: now,
    updatedAt: now,
    gstRegistrationId: reg.id,
    direction: "OUTWARD",
    sourceType: "INVOICE",
    sourceId: id,
    partyName: org.name,
    partyGstin: invoice.customerGstin,
    invoiceNo: no,
    invoiceDate,
    period: invoiceDate.slice(0, 7),
    taxableValue: taxable,
    cgst: invoice.cgst,
    sgst: invoice.sgst,
    igst: invoice.igst,
    itcEligible: false,
    rate: rate.toFixed(4),
  };

  // B7: retention withheld and GST-TDS deducted must reach the retention ledger and the GST report.
  const dedType = byId(db.deductionTypes, deductionTypeId);
  const isRetention = deductionTypeId === "ded_retention" || dedType?.code === "RETENTION";
  const isGstTds = deductionTypeId === "ded_tds_gst" || dedType?.code === "TDS_GST";
  const retentionEntries: RetentionEntry[] =
    isRetention && isPositive(ded)
      ? [{ id: `ret_${id}`, createdAt: now, updatedAt: now, side: "CLIENT", projectId: project.id, workOrderId: null, invoiceId: id, type: "WITHHELD", amount: ded, date: invoiceDate }]
      : [];
  const tdsTransactions: GstTransaction[] =
    isGstTds && isPositive(ded)
      ? [
          {
            ...gstTransaction,
            id: `gst_tds_${id}`,
            direction: "TDS_RECEIVED",
            ...splitTaxAmount(ded, intra),
            rate: ((Number(toPaise(ded)) / Number(toPaise(taxable))) * 100).toFixed(4),
          },
        ]
      : [];
  return { ok: true, invoice, deductions, gstTransaction, retentionEntries, tdsTransactions };
}

const norm = (s: string) => s.trim().toLowerCase();

/** Resolves a CSV record (names, codes or ids) into an entry. Columns: see INVOICE_HEADERS. A blank GSTIN means the project's GSTIN. */
export function resolveInvoiceRecord(db: Database, r: Record<string, string>, pendingNos: string[] = []): { entry?: InvoiceEntry; error?: string } {
  const customer = r["Customer"] ?? "";
  const org = db.organisations.find((o) => o.id === customer || norm(o.name) === norm(customer) || norm(o.shortName) === norm(customer));
  if (!org) return { error: `Customer "${customer}" not found` };
  const pq = r["Project"] ?? "";
  const projects = db.projects.filter((p) => !p.deletedAt && p.organisationId === org.id && (p.id === pq || norm(p.code) === norm(pq) || norm(p.name) === norm(pq)));
  if (projects.length !== 1) return { error: projects.length ? `Project "${pq}" is ambiguous` : `Project "${pq}" not found for ${org.name}` };
  const gq = r["GSTIN"] ?? "";
  const reg = gq.trim()
    ? db.gstRegistrations.find((g) => norm(g.gstin) === norm(gq) || g.id === gq)
    : byId(db.gstRegistrations, defaultGstRegistrationId(db, projects[0]));
  if (!reg) return { error: gq.trim() ? `GSTIN "${gq}" not found` : "GSTIN is blank and the project has no GSTIN" };
  const dq = r["Deduction type"] ?? "";
  const ded = db.deductionTypes.find((d) => d.id === dq || (dq !== "" && (norm(d.name) === norm(dq) || norm(d.code) === norm(dq))));
  const date = r["Invoice date"] ?? "";
  return {
    entry: {
      gstRegistrationId: reg.id,
      organisationId: org.id,
      projectId: projects[0].id,
      invoiceNo: r["Invoice no"] || suggestInvoiceNo(db, reg.id, parseDate(date) || getToday(), pendingNos),
      invoiceDate: date,
      invoiceType: (r["Type"] || "MONTHLY").toUpperCase() as InvoiceType,
      periodFrom: r["Period from"] ?? "",
      periodTo: r["Period to"] ?? "",
      taxableValue: r["Taxable value"] ?? "",
      gstPercent: r["GST %"] ?? "",
      deductions: r["Deductions"] ?? "",
      deductionTypeId: ded?.id ?? "ded_tds_it",
    },
  };
}
