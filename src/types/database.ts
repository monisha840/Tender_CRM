import type {
  Attendance,
  AuditLog,
  ApprovalAction,
  ApprovalRequest,
  ApprovalStep,
  AwardCondition,
  Bid,
  BidClarification,
  BoqItem,
  Organisation,
  CompetitorBid,
  CostEntry,
  DailyWorkItem,
  DailyWorkReport,
  DeductionType,
  Document,
  DocumentLink,
  DocumentType,
  Employee,
  EmployeeProfile,
  ExpenseCategory,
  GoNoGoDecision,
  GstRegistration,
  GstTransaction,
  LabourType,
  Material,
  Notification,
  Party,
  Payment,
  PayrollRun,
  Payslip,
  Permission,
  Project,
  ProjectBudgetLine,
  ProjectConversion,
  ProjectMember,
  ProjectStatus,
  PurchaseOrder,
  PurchaseRequest,
  PurchaseRequestItem,
  Invoice,
  InvoiceDeduction,
  Office,
  ServiceLine,
  Region,
  RegionGstRegistration,
  RetentionEntry,
  Role,
  RolePermission,
  SecurityInstrument,
  SecurityInstrumentEvent,
  Site,
  SiteAssignment,
  SiteIssue,
  State,
  StockTransaction,
  Subcontractor,
  SubcontractorBill,
  SubcontractorBillDeduction,
  SubcontractorWorkOrder,
  Tender,
  TenderAward,
  TenderDocumentItem,
  TenderPortal,
  TenderResult,
  TenderStage,
  TenderStageHistory,
  TenderType,
  User,
  UserRegion,
  UserRole,
  Vendor,
  VendorInvoice,
} from "./index";

/**
 * The whole mock "database": one array per entity, normalised by id references exactly as the
 * Prisma model will be. The Zustand store persists this to localStorage; `src/lib/data/*`
 * reads from it. Swapping in a real backend later means replacing those functions only.
 */
export interface Database {
  // Org & access
  states: State[];
  regions: Region[];
  offices: Office[];
  serviceLines: ServiceLine[];
  gstRegistrations: GstRegistration[];
  regionGstRegistrations: RegionGstRegistration[];
  organisations: Organisation[];
  users: User[];
  roles: Role[];
  permissions: Permission[];
  rolePermissions: RolePermission[];
  userRoles: UserRole[];
  userRegions: UserRegion[];
  employees: Employee[];
  employeeProfiles: EmployeeProfile[];
  labourTypes: LabourType[];
  // Masters
  tenderStages: TenderStage[];
  tenderResults: TenderResult[];
  tenderTypes: TenderType[];
  tenderPortals: TenderPortal[];
  documentTypes: DocumentType[];
  projectStatuses: ProjectStatus[];
  expenseCategories: ExpenseCategory[];
  deductionTypes: DeductionType[];
  materials: Material[];
  // Tenders
  tenders: Tender[];
  tenderStageHistory: TenderStageHistory[];
  goNoGoDecisions: GoNoGoDecision[];
  tenderDocumentItems: TenderDocumentItem[];
  securityInstruments: SecurityInstrument[];
  securityInstrumentEvents: SecurityInstrumentEvent[];
  bids: Bid[];
  bidClarifications: BidClarification[];
  competitorBids: CompetitorBid[];
  tenderAwards: TenderAward[];
  awardConditions: AwardCondition[];
  // Projects & sites
  projects: Project[];
  projectConversions: ProjectConversion[];
  projectMembers: ProjectMember[];
  sites: Site[];
  boqItems: BoqItem[];
  dailyReports: DailyWorkReport[];
  dailyWorkItems: DailyWorkItem[];
  siteIssues: SiteIssue[];
  projectBudgetLines: ProjectBudgetLine[];
  costEntries: CostEntry[];
  // Workforce
  siteAssignments: SiteAssignment[];
  attendance: Attendance[];
  payrollRuns: PayrollRun[];
  payslips: Payslip[];
  // Parties
  parties: Party[];
  subcontractors: Subcontractor[];
  vendors: Vendor[];
  workOrders: SubcontractorWorkOrder[];
  subcontractorBills: SubcontractorBill[];
  subcontractorBillDeductions: SubcontractorBillDeduction[];
  // Purchases
  purchaseRequests: PurchaseRequest[];
  purchaseRequestItems: PurchaseRequestItem[];
  purchaseOrders: PurchaseOrder[];
  vendorInvoices: VendorInvoice[];
  stockTransactions: StockTransaction[];
  // Accounts & GST
  invoices: Invoice[];
  invoiceDeductions: InvoiceDeduction[];
  payments: Payment[];
  retentionEntries: RetentionEntry[];
  gstTransactions: GstTransaction[];
  // Platform
  approvalRequests: ApprovalRequest[];
  approvalSteps: ApprovalStep[];
  approvalActions: ApprovalAction[];
  documents: Document[];
  documentLinks: DocumentLink[];
  notifications: Notification[];
  auditLogs: AuditLog[];
}
