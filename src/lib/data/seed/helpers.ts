import { addDays, DEMO_TODAY, istToUtc } from "@/lib/dates";
import { fromPaise } from "@/lib/money";
import type { Database, Id, IsoDate, IsoDateTime, Money } from "@/types";

/** Bump when seed content changes so persisted localStorage data is replaced. */
export const SEED_VERSION = 2;

/** Fixed timestamp for "created" columns: keeps the seed byte-for-byte deterministic. */
export const SEED_CREATED: IsoDateTime = istToUtc("2026-01-01", "09:00");

/** Mulberry32: tiny seeded PRNG. Same seed → same sequence on every machine. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Integer in [min, max] inclusive. */
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    float: (min: number, max: number) => next() * (max - min) + min,
    chance: (p: number) => next() < p,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
  };
}
export type Rng = ReturnType<typeof createRng>;

export const meta = <I extends Id>(id: I, createdAt: IsoDateTime = SEED_CREATED) => ({
  id,
  createdAt,
  updatedAt: createdAt,
  deletedAt: null as null,
});

/** Money from rupees (rounded to paise). */
export const rupees = (n: number): Money => fromPaise(BigInt(Math.round(n * 100)));
/** Money from lakh. */
export const lakh = (n: number): Money => rupees(n * 100_000);

/** Pure date `offset` days from the demo "today". */
export const dayOffset = (offset: number): IsoDate => addDays(DEMO_TODAY, offset);
/** UTC timestamp for a pure date at an IST wall-clock time. */
export const at = (date: IsoDate, time = "11:00"): IsoDateTime => istToUtc(date, time);

export const RegionKey = { cg: "reg_cg", mh: "reg_mh", south: "reg_south", delhi: "reg_delhi" } as const;
export type RegionKeyName = keyof typeof RegionKey;
/** Home state of each region's office (GST state of the default registration). */
export const StateOf: Record<RegionKeyName, Id> = { cg: "st_cg", mh: "st_mh", south: "st_tn", delhi: "st_dl" };

export function emptyDatabase(): Database {
  return {
    states: [],
    regions: [],
    offices: [],
    serviceLines: [],
    gstRegistrations: [],
    regionGstRegistrations: [],
    organisations: [],
    users: [],
    roles: [],
    permissions: [],
    rolePermissions: [],
    userRoles: [],
    userRegions: [],
    employees: [],
    employeeProfiles: [],
    labourTypes: [],
    tenderStages: [],
    tenderResults: [],
    tenderTypes: [],
    tenderPortals: [],
    documentTypes: [],
    projectStatuses: [],
    expenseCategories: [],
    deductionTypes: [],
    materials: [],
    tenders: [],
    tenderStageHistory: [],
    goNoGoDecisions: [],
    tenderDocumentItems: [],
    securityInstruments: [],
    securityInstrumentEvents: [],
    bids: [],
    bidClarifications: [],
    competitorBids: [],
    tenderAwards: [],
    awardConditions: [],
    projects: [],
    projectConversions: [],
    projectMembers: [],
    sites: [],
    boqItems: [],
    dailyReports: [],
    dailyWorkItems: [],
    siteIssues: [],
    projectBudgetLines: [],
    costEntries: [],
    siteAssignments: [],
    attendance: [],
    payrollRuns: [],
    payslips: [],
    parties: [],
    subcontractors: [],
    vendors: [],
    workOrders: [],
    subcontractorBills: [],
    subcontractorBillDeductions: [],
    purchaseRequests: [],
    purchaseRequestItems: [],
    purchaseOrders: [],
    vendorInvoices: [],
    stockTransactions: [],
    invoices: [],
    invoiceDeductions: [],
    payments: [],
    retentionEntries: [],
    gstTransactions: [],
    approvalRequests: [],
    approvalSteps: [],
    approvalActions: [],
    documents: [],
    documentLinks: [],
    notifications: [],
    auditLogs: [],
  };
}

/** Build-time context shared by the seed modules. */
export interface SeedCtx {
  db: Database;
  rng: Rng;
  /** Convenience lookups filled in as modules run. */
  ref: Record<string, Id>;
}

export function pad(n: number, width = 3): string {
  return String(n).padStart(width, "0");
}

/** Indian financial year label for a pure date: "2026-27". */
export function financialYear(date: IsoDate): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
