import type { Database, Id, PurchaseOrder, PurchaseRequest, PurchaseRequestStatus, VendorInvoice } from "@/types";
import { byId, inRegion, type RegionFilter } from "./shared";

export interface PurchaseRequestRow {
  request: PurchaseRequest;
  projectName: string;
  siteName: string;
  requestedBy: string;
  itemCount: number;
}

export function listPurchaseRequests(db: Database, region: RegionFilter = "ALL", status?: PurchaseRequestStatus): PurchaseRequestRow[] {
  return db.purchaseRequests
    .filter((r) => !r.deletedAt && inRegion(region, r.regionId) && (!status || r.status === status))
    .map((request) => ({
      request,
      projectName: byId(db.projects, request.projectId)?.name ?? "—",
      siteName: byId(db.sites, request.siteId)?.name ?? "—",
      requestedBy: byId(db.users, request.requestedById)?.name ?? "—",
      itemCount: db.purchaseRequestItems.filter((i) => i.requestId === request.id).length,
    }))
    .sort((a, b) => a.request.neededBy.localeCompare(b.request.neededBy));
}

export function getPurchaseRequest(db: Database, id: Id) {
  const row = listPurchaseRequests(db).find((r) => r.request.id === id);
  if (!row) return null;
  return {
    ...row,
    items: db.purchaseRequestItems
      .filter((i) => i.requestId === id)
      .map((item) => ({ item, material: byId(db.materials, item.materialId)! })),
  };
}

export interface PurchaseOrderRow {
  order: PurchaseOrder;
  vendorName: string;
  projectName: string;
  invoices: VendorInvoice[];
}

export function listPurchaseOrders(db: Database, region: RegionFilter = "ALL"): PurchaseOrderRow[] {
  return db.purchaseOrders
    .filter((o) => !o.deletedAt && inRegion(region, o.regionId))
    .map((order) => ({
      order,
      vendorName: byId(db.parties, byId(db.vendors, order.vendorId)?.partyId)?.name ?? "—",
      projectName: byId(db.projects, order.projectId)?.name ?? "—",
      invoices: db.vendorInvoices.filter((i) => i.purchaseOrderId === order.id),
    }))
    .sort((a, b) => b.order.poDate.localeCompare(a.order.poDate));
}

export function listVendorInvoices(db: Database, region: RegionFilter = "ALL") {
  return db.vendorInvoices
    .filter((i) => !i.deletedAt && inRegion(region, i.regionId))
    .map((invoice) => ({
      invoice,
      vendorName: byId(db.parties, byId(db.vendors, invoice.vendorId)?.partyId)?.name ?? "—",
      projectName: byId(db.projects, invoice.projectId)?.name ?? "—",
    }))
    .sort((a, b) => b.invoice.invoiceDate.localeCompare(a.invoice.invoiceDate));
}
