import {
  Bell,
  Building2,
  CalendarCheck,
  CheckSquare,
  FileBarChart,
  FolderKanban,
  Gavel,
  HardHat,
  LayoutDashboard,
  Percent,
  PiggyBank,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavModule {
  /** Matches `Permission.module` in the seed data. */
  key: string;
  label: string;
  /** Shorter label for the mobile bottom bar. */
  shortLabel?: string;
  href: string;
  icon: LucideIcon;
  group: "Overview" | "Business" | "People" | "Money" | "Management";
  /** One line shown on the placeholder page. */
  description: string;
  /** Build phase from CLAUDE.md in which the real screen arrives. */
  phase: string;
}

/** Navigation per docs/system-flow.md §15. Visibility comes from role permissions, not from here. */
export const NAV_MODULES: NavModule[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "Overview", phase: "Phase 3 — Director Dashboard", description: "What needs attention, what is pending and what to do next." },
  { key: "tenders", label: "Tenders", href: "/tenders", icon: Gavel, group: "Business", phase: "Phase 1 — Tenders", description: "Register tenders, take GO / NO-GO decisions, track EMD, bids and results." },
  { key: "projects", label: "Projects", href: "/projects", icon: FolderKanban, group: "Business", phase: "Phase 2 — Projects & Daily Work", description: "Projects created from won tenders: BOQ, progress, health and budget." },
  { key: "sites", label: "Sites / Work", shortLabel: "Work", href: "/sites", icon: HardHat, group: "Business", phase: "Phase 2 — Projects & Daily Work", description: "Daily work reports, site issues, photos and stock." },
  { key: "people", label: "People & Teams", href: "/people", icon: Users, group: "People", phase: "Phase 0 — Foundation", description: "Employees, teams, site assignments and reporting lines." },
  { key: "subcontractors", label: "Subcontractors", href: "/subcontractors", icon: Building2, group: "People", phase: "Phase 4 — Subcontractors", description: "Subcontractor master, work orders, bills and outstanding balances." },
  { key: "attendance", label: "Attendance & Payroll", shortLabel: "Attendance", href: "/attendance", icon: CalendarCheck, group: "People", phase: "Phase 6 — Attendance & Payroll", description: "Site attendance, overtime, leave, payroll runs and payslips." },
  { key: "purchases", label: "Purchases", shortLabel: "Requests", href: "/purchases", icon: ShoppingCart, group: "Money", phase: "Phase 5 — Purchases & Vendors", description: "Site requests, approvals, purchase orders, receipts and vendor invoices." },
  { key: "accounts", label: "Accounts & Payments", href: "/accounts", icon: Wallet, group: "Money", phase: "Phase 7 — Accounts, RA Billing & GST", description: "RA bills, receipts, payments, receivables and payables." },
  { key: "gst", label: "GST", href: "/gst", icon: Percent, group: "Money", phase: "Phase 7 — Accounts, RA Billing & GST", description: "Outward and inward supplies, input credit and GST TDS per GSTIN." },
  { key: "epf", label: "EPF", href: "/epf", icon: PiggyBank, group: "Money", phase: "Phase 6 — Attendance & Payroll", description: "EPF contributions from payroll and the EPFO export." },
  { key: "reports", label: "Reports", href: "/reports", icon: FileBarChart, group: "Management", phase: "Phase 8 — Hardening", description: "Management and statutory reports." },
  { key: "approvals", label: "Approvals", href: "/approvals", icon: CheckSquare, group: "Management", phase: "Phase 0 — Foundation", description: "Everything waiting for a decision, in one place." },
  { key: "notifications", label: "Notifications", shortLabel: "Alerts", href: "/notifications", icon: Bell, group: "Management", phase: "Phase 0 — Foundation", description: "Deadlines, follow-ups and alerts." },
  { key: "settings", label: "Settings", href: "/settings", icon: Settings, group: "Management", phase: "Phase 0 — Foundation", description: "Regions, GSTINs, roles, stages, checklists and approval rules." },
];

export const NAV_GROUP_ORDER: NavModule["group"][] = ["Overview", "Business", "People", "Money", "Management"];

export const findModule = (pathname: string): NavModule | undefined =>
  NAV_MODULES.find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`));

export const getModule = (key: string): NavModule => {
  const m = NAV_MODULES.find((x) => x.key === key);
  if (!m) throw new Error(`Unknown nav module: ${key}`);
  return m;
};
