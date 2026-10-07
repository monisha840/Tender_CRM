import { addDays, getToday } from "@/lib/dates";
import { addMoney, cmpMoney, fromPaise, isPositive, percentOf, subMoney, toPaise } from "@/lib/money";
import { byId } from "@/lib/data/shared";
import type { Database, GstFilingStatus, GstTransaction, Invoice, InvoiceDeduction, InvoiceType, Money } from "@/types";

export interface InvoiceEntry {
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

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

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

/** Next invoice number for a GSTIN: continues the latest number's prefix and sequence, else starts a new series. */
export function suggestInvoiceNo(db: Database, gstRegistrationId: string, invoiceDate = getToday()): string {
  const mine = db.invoices.filter((i) => i.gstRegistrationId === gstRegistrationId && !i.deletedAt);
  const latest = mine.map((i) => i.invoiceNo).sort().pop();
  const m = latest?.match(/^(.*?)(\d+)$/);
  if (m) return `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, "0")}`;
  const y = Number(invoiceDate.slice(0, 4));
  const fyStart = Number(invoiceDate.slice(5, 7)) >= 4 ? y : y - 1;
  return `SPH/${fyStart % 100}-${(fyStart + 1) % 100}/0001`;
}

export type BuildResult = { ok: true; invoice: Invoice; deductions: InvoiceDeduction[]; gstTransaction: GstTransaction } | { ok: false; error: string };

/** Validates an entry and computes tax split, totals, due dates and statuses. Used by the form and the CSV import. */
export function buildInvoice(db: Database, e: InvoiceEntry, pendingNos: string[] = [], now = new Date().toISOString()): BuildResult {
  const fail = (error: string): BuildResult => ({ ok: false, error });
  const reg = byId(db.gstRegistrations, e.gstRegistrationId);
  if (!reg) return fail("GSTIN not found");
  const org = byId(db.organisations, e.organisationId);
  if (!org) return fail("Customer organisation not found");
  const project = byId(db.projects, e.projectId);
  if (!project) return fail("Project not found");
  if (project.organisationId !== org.id) return fail(`Project "${project.name}" belongs to a different customer`);
  const no = e.invoiceNo.trim();
  if (!no) return fail("Invoice number is required");
  const key = `${reg.id}|${no.toLowerCase()}`;
  if (pendingNos.includes(key) || db.invoices.some((i) => !i.deletedAt && i.gstRegistrationId === reg.id && i.invoiceNo.toLowerCase() === no.toLowerCase()))
    return fail(`Invoice number ${no} already exists for this GSTIN`);
  if (!isDate(e.invoiceDate)) return fail("Invoice date must be YYYY-MM-DD");
  if (!INVOICE_TYPES.includes(e.invoiceType)) return fail("Type must be MONTHLY, MILESTONE or FINAL");
  const periodFrom = e.periodFrom || e.invoiceDate;
  const periodTo = e.periodTo || e.invoiceDate;
  if (!isDate(periodFrom) || !isDate(periodTo)) return fail("Period dates must be YYYY-MM-DD");
  if (periodTo < periodFrom) return fail("Period end is before period start");
  const taxable = parseMoney(e.taxableValue);
  if (!taxable || !isPositive(taxable)) return fail("Taxable value must be a positive amount");
  const rate = Number(e.gstPercent === "" ? 18 : e.gstPercent);
  if (!Number.isFinite(rate) || rate < 0 || rate > 40) return fail("GST % must be between 0 and 40");
  const ded = e.deductions.trim() === "" ? "0.00" : parseMoney(e.deductions);
  if (ded === null) return fail("Deductions must be a valid amount");

  const gst = percentOf(taxable, rate);
  const total = addMoney(taxable, gst);
  if (cmpMoney(ded, total) > 0) return fail("Deductions exceed the invoice total");

  // Place of supply is the plant site's state, as in the seeded invoices; same state as our GSTIN => CGST + SGST.
  const placeOfSupply = byId(db.sites, project.siteId)?.stateId ?? org.stateId;
  const intra = placeOfSupply === reg.stateId;
  const half = percentOf(gst, 50);
  const net = subMoney(total, ded);
  const id = `inv_new_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
  const gstFilingStatus: GstFilingStatus = "PENDING";
  const invoice: Invoice = {
    id,
    createdAt: now,
    updatedAt: now,
    gstRegistrationId: reg.id,
    invoiceNo: no,
    invoiceDate: e.invoiceDate,
    organisationId: org.id,
    customerGstin: org.gstin ?? "UNREGISTERED",
    projectId: project.id,
    regionId: project.regionId,
    invoiceType: e.invoiceType,
    periodFrom,
    periodTo,
    taxableValue: taxable,
    cgst: intra ? half : "0.00",
    sgst: intra ? subMoney(gst, half) : "0.00",
    igst: intra ? "0.00" : gst,
    total,
    totalDeductions: ded,
    netReceivable: net,
    receivedAmount: "0.00",
    dueDate: addDays(e.invoiceDate, project.paymentTermsDays),
    paymentStatus: "UNPAID",
    gstFilingStatus,
    filingReference: null,
    gstFilingDueDate: gstFilingDue(e.invoiceDate),
  };
  const deductions: InvoiceDeduction[] = isPositive(ded)
    ? [{ id: `ivd_${id}_1`, createdAt: now, updatedAt: now, invoiceId: id, deductionTypeId: e.deductionTypeId || "ded_tds_it", amount: ded }]
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
    invoiceDate: e.invoiceDate,
    period: e.invoiceDate.slice(0, 7),
    taxableValue: taxable,
    cgst: invoice.cgst,
    sgst: invoice.sgst,
    igst: invoice.igst,
    itcEligible: false,
    rate: rate.toFixed(4),
  };
  return { ok: true, invoice, deductions, gstTransaction };
}

const norm = (s: string) => s.trim().toLowerCase();

/** Resolves a CSV record (names, codes or ids) into an entry. Columns: see INVOICE_HEADERS. */
export function resolveInvoiceRecord(db: Database, r: Record<string, string>): { entry?: InvoiceEntry; error?: string } {
  const reg = db.gstRegistrations.find((g) => norm(g.gstin) === norm(r["GSTIN"] ?? "") || g.id === r["GSTIN"]);
  if (!reg) return { error: `GSTIN "${r["GSTIN"] ?? ""}" not found` };
  const customer = r["Customer"] ?? "";
  const org = db.organisations.find((o) => o.id === customer || norm(o.name) === norm(customer) || norm(o.shortName) === norm(customer));
  if (!org) return { error: `Customer "${customer}" not found` };
  const pq = r["Project"] ?? "";
  const projects = db.projects.filter((p) => !p.deletedAt && p.organisationId === org.id && (p.id === pq || norm(p.code) === norm(pq) || norm(p.name) === norm(pq)));
  if (projects.length !== 1) return { error: projects.length ? `Project "${pq}" is ambiguous` : `Project "${pq}" not found for ${org.name}` };
  const dq = r["Deduction type"] ?? "";
  const ded = db.deductionTypes.find((d) => d.id === dq || (dq !== "" && (norm(d.name) === norm(dq) || norm(d.code) === norm(dq))));
  const date = r["Invoice date"] ?? "";
  return {
    entry: {
      gstRegistrationId: reg.id,
      organisationId: org.id,
      projectId: projects[0].id,
      invoiceNo: r["Invoice no"] || suggestInvoiceNo(db, reg.id, date || getToday()),
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
