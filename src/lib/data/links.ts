import type { Id } from "@/types";

/**
 * Where an entity lives in the app. Module detail screens are not built yet, so everything
 * resolves to its module root with `?focus=<id>`; screens can read it to open the record.
 */
const ENTITY_MODULE: Record<string, string> = {
  TENDER: "/tenders",
  TENDER_GO_NO_GO: "/tenders",
  PROJECT: "/projects",
  SITE: "/sites",
  SUBCONTRACTOR_BILL: "/subcontractors",
  PURCHASE_REQUEST: "/purchases",
  PURCHASE_ORDER: "/purchases",
  PAYROLL_RUN: "/attendance",
  RA_BILL: "/accounts",
  APPROVAL_REQUEST: "/approvals",
};

export function entityHref(entityType: string | null | undefined, id?: Id | null): string {
  const base = (entityType && ENTITY_MODULE[entityType]) || "/dashboard";
  return id ? `${base}?focus=${encodeURIComponent(id)}` : base;
}

export const ENTITY_LABEL: Record<string, string> = {
  TENDER_GO_NO_GO: "GO / NO-GO",
  SUBCONTRACTOR_BILL: "Subcontractor bill",
  PURCHASE_REQUEST: "Purchase request",
  PURCHASE_ORDER: "Purchase order",
  PAYROLL_RUN: "Payroll run",
  RA_BILL: "RA bill",
};
