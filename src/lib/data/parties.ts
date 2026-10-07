import { addMoney, subMoney, sumMoney } from "@/lib/money";
import type { Database, Id, IsoDate, Money, Party, Project, Subcontractor, SubcontractorWorkOrder, Vendor } from "@/types";
import { byId, inRegion, type RegionFilter } from "./shared";

export interface SubcontractorRow {
  subcontractor: Subcontractor;
  party: Party;
  /** Many-to-many: every project this subcontractor has a work order on. */
  projects: Project[];
  /** Distinct trades assigned, e.g. ["Painting"]. */
  trades: string[];
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
        trades: [...new Set(orders.map((o) => o.trade))],
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

export interface AssignmentRow {
  workOrder: SubcontractorWorkOrder;
  subcontractorName: string;
  projectName: string;
  projectCode: string;
  /** Assigned work as a trade. */
  trade: string;
  contractValue: Money;
  startDate: IsoDate;
  endDate: IsoDate | null;
  /** Physical progress, 0–100. */
  progressPct: number;
  billCount: number;
  /** Sum of bill gross amounts (before GST and deductions). */
  billed: Money;
  /** Net payable on all bills (after GST and deductions). */
  netPayable: Money;
  paid: Money;
  /** Net payable not yet paid. */
  balance: Money;
  lastPaymentDate: IsoDate | null;
}

export interface AssignmentFilters {
  projectId?: Id;
  subcontractorId?: Id;
  region?: RegionFilter;
}

/** Subcontractor assignments per project: assigned work, value, dates, progress, bills, paid, balance and payment date. */
export function listSubcontractorAssignments(db: Database, filters: AssignmentFilters = {}): AssignmentRow[] {
  return db.workOrders
    .filter((w) => !w.deletedAt && inRegion(filters.region ?? "ALL", w.regionId))
    .filter((w) => !filters.projectId || w.projectId === filters.projectId)
    .filter((w) => !filters.subcontractorId || w.subcontractorId === filters.subcontractorId)
    .map((workOrder): AssignmentRow => {
      const bills = db.subcontractorBills.filter((b) => b.workOrderId === workOrder.id);
      const payments = db.payments.filter((p) => p.subcontractorBillId && bills.some((b) => b.id === p.subcontractorBillId));
      const netPayable = sumMoney(bills.map((b) => b.netPayable));
      const paid = sumMoney(bills.map((b) => b.paidAmount));
      const project = byId(db.projects, workOrder.projectId);
      return {
        workOrder,
        subcontractorName: byId(db.parties, byId(db.subcontractors, workOrder.subcontractorId)?.partyId)?.name ?? "—",
        projectName: project?.name ?? "—",
        projectCode: project?.code ?? "—",
        trade: workOrder.trade,
        contractValue: workOrder.contractValue,
        startDate: workOrder.startDate,
        endDate: workOrder.endDate ?? null,
        progressPct: Number(workOrder.progressPercent),
        billCount: bills.length,
        billed: sumMoney(bills.map((b) => b.grossAmount)),
        netPayable,
        paid,
        balance: subMoney(netPayable, paid),
        lastPaymentDate: payments.map((p) => p.paidOn).sort().pop() ?? null,
      };
    })
    .sort((a, b) => a.projectCode.localeCompare(b.projectCode) || a.trade.localeCompare(b.trade));
}
