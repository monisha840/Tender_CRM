import { addMoney, sumMoney } from "@/lib/money";
import type { Database, Id, IsoDate, Money, Party, Project, Subcontractor, SubcontractorWorkOrder, Vendor } from "@/types";
import { balanceOf, isApprovedSubBill, isBilledSubBill, isBillAwaitingApproval, isLive, isPayableSubBill } from "./definitions";
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
  /** Gross of live, non-rejected, non-draft bills (before GST and deductions). */
  billed: Money;
  /** Net payable on approved and part-paid bills not yet paid (rejected bills never count). */
  outstanding: Money;
  billsAwaitingApproval: number;
}

export function listSubcontractors(db: Database, region: RegionFilter = "ALL"): SubcontractorRow[] {
  return db.subcontractors
    .filter(isLive)
    .map((subcontractor): SubcontractorRow => {
      const orders = db.workOrders.filter((w) => isLive(w) && w.subcontractorId === subcontractor.id && inRegion(region, w.regionId));
      const bills = db.subcontractorBills.filter((b) => isLive(b) && b.subcontractorId === subcontractor.id && inRegion(region, b.regionId));
      const projectIds = [...new Set(orders.map((o) => o.projectId))];
      return {
        subcontractor,
        party: byId(db.parties, subcontractor.partyId)!,
        projects: projectIds.map((id) => byId(db.projects, id)!).filter(Boolean),
        trades: [...new Set(orders.map((o) => o.trade))],
        workOrderCount: orders.length,
        contractValue: sumMoney(orders.map((o) => o.contractValue)),
        billed: sumMoney(bills.filter(isBilledSubBill).map((b) => b.grossAmount)),
        outstanding: sumMoney(bills.filter(isPayableSubBill).map((b) => balanceOf(b.netPayable, b.paidAmount))),
        billsAwaitingApproval: bills.filter(isBillAwaitingApproval).length,
      };
    })
    .filter((r) => r.workOrderCount > 0 || region === "ALL")
    .sort((a, b) => a.party.name.localeCompare(b.party.name));
}

/** Outstanding per project for one subcontractor, plus the overall total. */
export function getSubcontractorOutstanding(db: Database, subcontractorId: Id) {
  const perProject = new Map<Id, Money>();
  db.subcontractorBills
    .filter((b) => b.subcontractorId === subcontractorId && isPayableSubBill(b))
    .forEach((b) => perProject.set(b.projectId, addMoney(perProject.get(b.projectId) ?? "0.00", balanceOf(b.netPayable, b.paidAmount))));
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
  /** Sum of gross amounts (before GST and deductions) of live, non-rejected, non-draft bills. */
  billed: Money;
  /** Net payable on approved bills (after GST and deductions); rejected and unapproved bills are excluded. */
  netPayable: Money;
  /** Paid against those approved bills. */
  paid: Money;
  /** Net payable not yet paid; same rule as the dashboard and Finance payables. */
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
    .filter((w) => isLive(w) && inRegion(filters.region ?? "ALL", w.regionId))
    .filter((w) => !filters.projectId || w.projectId === filters.projectId)
    .filter((w) => !filters.subcontractorId || w.subcontractorId === filters.subcontractorId)
    .map((workOrder): AssignmentRow => {
      const bills = db.subcontractorBills.filter((b) => isLive(b) && b.workOrderId === workOrder.id);
      const approved = bills.filter(isApprovedSubBill);
      const payments = db.payments.filter((p) => isLive(p) && p.subcontractorBillId && approved.some((b) => b.id === p.subcontractorBillId));
      const netPayable = sumMoney(approved.map((b) => b.netPayable));
      const paid = sumMoney(approved.map((b) => b.paidAmount));
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
        billCount: bills.filter(isBilledSubBill).length,
        billed: sumMoney(bills.filter(isBilledSubBill).map((b) => b.grossAmount)),
        netPayable,
        paid,
        balance: sumMoney(approved.map((b) => balanceOf(b.netPayable, b.paidAmount))),
        lastPaymentDate: payments.map((p) => p.paidOn).sort().pop() ?? null,
      };
    })
    .sort((a, b) => a.projectCode.localeCompare(b.projectCode) || a.trade.localeCompare(b.trade));
}
