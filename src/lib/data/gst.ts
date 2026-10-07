import { addMoney, subMoney, sumMoney } from "@/lib/money";
import type { Database, GstDirection, GstRegistration, GstTransaction, Id, Money } from "@/types";
import { isLive } from "./definitions";
import { byId } from "./shared";

export interface GstFilters {
  gstRegistrationId?: Id | "ALL";
  /** "YYYY-MM" */
  period?: string;
  direction?: GstDirection;
}

export function listGstTransactions(db: Database, filters: GstFilters = {}): GstTransaction[] {
  return db.gstTransactions
    .filter(isLive)
    .filter((t) => !filters.gstRegistrationId || filters.gstRegistrationId === "ALL" || t.gstRegistrationId === filters.gstRegistrationId)
    .filter((t) => !filters.period || t.period === filters.period)
    .filter((t) => !filters.direction || t.direction === filters.direction)
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
}

const taxOf = (t: GstTransaction): Money => addMoney(addMoney(t.cgst, t.sgst), t.igst);

export interface GstSummary {
  registration: GstRegistration | null;
  outwardTaxable: Money;
  outwardTax: Money;
  inwardTaxable: Money;
  /** Tax on inward supplies where input credit is allowed. */
  itcAvailable: Money;
  /** GST deducted by departments at source. */
  tdsReceived: Money;
  /** Outward tax less ITC less TDS; negative means credit carried forward. */
  netPayable: Money;
}

export function getGstSummary(db: Database, filters: GstFilters = {}): GstSummary {
  const rows = listGstTransactions(db, filters);
  const of = (d: GstDirection) => rows.filter((t) => t.direction === d);
  const outwardTax = sumMoney(of("OUTWARD").map(taxOf));
  const itcAvailable = sumMoney(of("INWARD").filter((t) => t.itcEligible).map(taxOf));
  const tdsReceived = sumMoney(of("TDS_RECEIVED").map(taxOf));
  return {
    registration: filters.gstRegistrationId && filters.gstRegistrationId !== "ALL" ? (byId(db.gstRegistrations, filters.gstRegistrationId) ?? null) : null,
    outwardTaxable: sumMoney(of("OUTWARD").map((t) => t.taxableValue)),
    outwardTax,
    inwardTaxable: sumMoney(of("INWARD").map((t) => t.taxableValue)),
    itcAvailable,
    tdsReceived,
    netPayable: subMoney(subMoney(outwardTax, itcAvailable), tdsReceived),
  };
}

export const listGstPeriods = (db: Database): string[] =>
  [...new Set(db.gstTransactions.filter(isLive).map((t) => t.period))].sort().reverse();
