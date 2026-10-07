import type { BaseEntity, Id, IsoDate, Money } from "./common";

export interface Material extends BaseEntity {
  name: string;
  unit: string;
  hsn?: string | null;
}

export type PurchaseRequestStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "ORDERED";

/** Site request: always tied to a project and site, never isolated. */
export interface PurchaseRequest extends BaseEntity {
  requestNo: string;
  projectId: Id;
  siteId: Id;
  regionId: Id;
  requestedById: Id;
  neededBy: IsoDate;
  status: PurchaseRequestStatus;
  estimatedAmount: Money;
  approvalRequestId?: Id | null;
}

export interface PurchaseRequestItem extends BaseEntity {
  requestId: Id;
  materialId: Id;
  quantity: string;
}

export type PurchaseOrderStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PARTLY_RECEIVED" | "RECEIVED" | "CANCELLED";

export interface PurchaseOrder extends BaseEntity {
  poNo: string;
  requestId?: Id | null;
  vendorId: Id;
  projectId: Id;
  siteId: Id;
  regionId: Id;
  gstRegistrationId: Id;
  poDate: IsoDate;
  amount: Money;
  gstAmount: Money;
  status: PurchaseOrderStatus;
  approvalRequestId?: Id | null;
}

export type VendorInvoiceStatus = "RECEIVED" | "APPROVED" | "PARTLY_PAID" | "PAID";

export interface VendorInvoice extends BaseEntity {
  invoiceNo: string;
  purchaseOrderId?: Id | null;
  vendorId: Id;
  projectId: Id;
  regionId: Id;
  gstRegistrationId: Id;
  invoiceDate: IsoDate;
  dueDate: IsoDate;
  taxableValue: Money;
  cgst: Money;
  sgst: Money;
  igst: Money;
  total: Money;
  paidAmount: Money;
  itcEligible: boolean;
  status: VendorInvoiceStatus;
}

export type StockTransactionType = "RECEIPT" | "ISSUE" | "CONSUMPTION" | "RETURN" | "TRANSFER" | "ADJUSTMENT" | "WASTAGE";

export interface StockTransaction extends BaseEntity {
  siteId: Id;
  projectId: Id;
  materialId: Id;
  type: StockTransactionType;
  quantity: string;
  rate: Money;
  date: IsoDate;
}
