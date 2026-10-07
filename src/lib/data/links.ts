import type { Id } from "@/types";

/** Where an entity lives in the app: its detail page when one exists, otherwise the module list. */
const ENTITY_DETAIL: Record<string, (id: string) => string> = {
  TENDER: (id) => `/tenders/${id}`,
  TENDER_GO_NO_GO: (id) => `/tenders/${id}`,
  PROJECT: (id) => `/projects/${id}`,
  SUBCONTRACTOR: (id) => `/subcontractors/${id}`,
  INVOICE: (id) => `/finance/invoices/${id}`,
  EMPLOYEE: (id) => `/employees/${id}`,
  SITE: (id) => `/daily-work?site=${id}`,
};

const ENTITY_MODULE: Record<string, string> = {
  SUBCONTRACTOR_BILL: "/subcontractors",
  PURCHASE_REQUEST: "/daily-work",
  PURCHASE_ORDER: "/daily-work",
  PAYROLL_RUN: "/employees/payroll",
  APPROVAL_REQUEST: "/approvals",
};

export function entityHref(entityType: string | null | undefined, id?: Id | null): string {
  const key = entityType ?? "";
  if (id && ENTITY_DETAIL[key]) return ENTITY_DETAIL[key](encodeURIComponent(id));
  return ENTITY_MODULE[key] ?? "/dashboard";
}

export const ENTITY_LABEL: Record<string, string> = {
  TENDER_GO_NO_GO: "GO / NO-GO",
  SUBCONTRACTOR_BILL: "Subcontractor bill",
  PURCHASE_REQUEST: "Purchase request",
  PURCHASE_ORDER: "Purchase order",
  PAYROLL_RUN: "Payroll run",
  INVOICE: "Invoice",
};
