import { AGEING_BUCKETS, ageingBucketOf } from "./definitions";
import type { Id } from "@/types";

/** Where an entity lives in the app: its detail page when one exists, otherwise the module list. */
const ENTITY_DETAIL: Record<string, (id: string) => string> = {
  TENDER: (id) => `/tenders/${id}`,
  TENDER_GO_NO_GO: (id) => `/tenders/${id}`,
  TENDER_CONVERSION: (id) => `/tenders/${id}`,
  PROJECT: (id) => `/projects/${id}`,
  SUBCONTRACTOR: (id) => `/subcontractors/${id}`,
  INVOICE: (id) => `/finance/invoices/${id}`,
  EMPLOYEE: (id) => `/employees/${id}`,
  SITE: (id) => `/daily-work?site=${id}`,
};

/** Purchases have no screen of their own yet; their requests are decided in the approvals inbox. */
const ENTITY_MODULE: Record<string, string> = {
  SUBCONTRACTOR_BILL: "/subcontractors",
  PURCHASE_REQUEST: "/approvals",
  PURCHASE_ORDER: "/approvals",
  PAYROLL_RUN: "/employees/payroll",
  APPROVAL_REQUEST: "/approvals",
};

export function entityHref(entityType: string | null | undefined, id?: Id | null): string {
  const key = entityType ?? "";
  if (id && ENTITY_DETAIL[key]) return ENTITY_DETAIL[key](encodeURIComponent(id));
  return ENTITY_MODULE[key] ?? "/dashboard";
}

/** A route `[id]` segment back to the record id (it arrives percent-encoded when the id had special characters). */
export function decodeRouteId(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Receivables drill-down from the dashboard ageing chart: the same buckets as the chart (days past the payment due date). */
export const DASHBOARD_AGEING: { label: string; test: (daysOverdue: number) => boolean }[] = AGEING_BUCKETS.map((label) => ({
  label,
  test: (d: number) => ageingBucketOf(d) === label,
}));

export const ENTITY_LABEL: Record<string, string> = {
  TENDER_GO_NO_GO: "GO / NO-GO",
  TENDER_CONVERSION: "Convert to project",
  SUBCONTRACTOR_BILL: "Subcontractor bill",
  PURCHASE_REQUEST: "Purchase request",
  PURCHASE_ORDER: "Purchase order",
  PAYROLL_RUN: "Payroll run",
  INVOICE: "Invoice",
};
