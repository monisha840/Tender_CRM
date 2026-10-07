import { addMoney, subMoney, sumMoney } from "@/lib/money";
import type { Database, Id, Money, Party, Project, Subcontractor, Vendor } from "@/types";
import { byId, inRegion, type RegionFilter } from "./shared";

export interface SubcontractorRow {
  subcontractor: Subcontractor;
  party: Party;
  /** Many-to-many: every project this subcontractor has a work order on. */
  projects: Project[];
  workOrderCount: number;
  contractValue: Money;
  billed: Money;
  /** Net payable on approved/part-paid bills not yet paid. */
  outstanding: Money;
  billsAwaitingApproval: number;
}

export function listSubcontractors(db: Database, region: RegionFilter = "ALL"): SubcontractorRow[] {
  return db.subcontractors
    .filter((s) => !s.deletedAt)
    .map((subcontractor): SubcontractorRow => {
      const orders = db.workOrders.filter((w) => w.subcontractorId === subcontractor.id && inRegion(region, w.regionId));
      const bills = db.subcontractorBills.filter((b) => b.subcontractorId === subcontractor.id && inRegion(region, b.regionId));
      const projectIds = [...new Set(orders.map((o) => o.projectId))];
      return {
        subcontractor,
        party: byId(db.parties, subcontractor.partyId)!,
        projects: projectIds.map((id) => byId(db.projects, id)!).filter(Boolean),
        workOrderCount: orders.length,
        contractValue: sumMoney(orders.map((o) => o.contractValue)),
        billed: sumMoney(bills.map((b) => b.grossAmount)),
        outstanding: sumMoney(
          bills.filter((b) => b.status !== "SUBMITTED" && b.status !== "DRAFT" && b.status !== "REJECTED").map((b) => subMoney(b.netPayable, b.paidAmount)),
        ),
        billsAwaitingApproval: bills.filter((b) => b.status === "SUBMITTED").length,
      };
    })
    .filter((r) => r.workOrderCount > 0 || region === "ALL")
    .sort((a, b) => a.party.name.localeCompare(b.party.name));
}

/** Outstanding per project for one subcontractor, plus the overall total. */
export function getSubcontractorOutstanding(db: Database, subcontractorId: Id) {
  const perProject = new Map<Id, Money>();
  db.subcontractorBills
    .filter((b) => b.subcontractorId === subcontractorId && ["APPROVED", "PARTLY_PAID"].includes(b.status))
    .forEach((b) => perProject.set(b.projectId, addMoney(perProject.get(b.projectId) ?? "0.00", subMoney(b.netPayable, b.paidAmount))));
  return {
    perProject: [...perProject.entries()].map(([projectId, outstanding]) => ({ project: byId(db.projects, projectId)!, outstanding })),
    total: sumMoney([...perProject.values()]),
  };
}

export function listVendors(db: Database): (Vendor & { party: Party })[] {
  return db.vendors.map((v) => ({ ...v, party: byId(db.parties, v.partyId)! }));
}
