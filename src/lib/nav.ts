import {
  Building2,
  CheckSquare,
  FolderKanban,
  Gavel,
  HardHat,
  LayoutDashboard,
  Settings,
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
  group: "Overview" | "Business" | "People & Money" | "Operations" | "Management";
  /** One line shown on the placeholder page. */
  description: string;
  /** Build phase from CLAUDE.md in which the real screen arrives. */
  phase: string;
  /** False for pages reached another way (the header bell) rather than from the sidebar. */
  inNav?: boolean;
}

/** Navigation per the client requirements. Visibility comes from role permissions, not from here. */
export const NAV_MODULES: NavModule[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "Overview", phase: "Phase 3 — Director Dashboard", description: "What needs attention, what is pending and what to do next." },
  { key: "tenders", label: "Tenders", href: "/tenders", icon: Gavel, group: "Business", phase: "Phase 1 — Tenders", description: "Register tenders, evaluate and decide GO / NO-GO, prepare and submit bids, track results." },
  { key: "projects", label: "Projects", href: "/projects", icon: FolderKanban, group: "Business", phase: "Phase 2 — Projects & Daily Work", description: "Work orders from won tenders: contract, billing, payment, progress and health." },
  { key: "subcontractors", label: "Subcontractors", href: "/subcontractors", icon: Building2, group: "Business", phase: "Phase 4 — Subcontractors", description: "Subcontractor assignments per project: trade, value, progress, bills, paid and balance." },
  { key: "employees", label: "Employees", shortLabel: "Employees", href: "/employees", icon: Users, group: "People & Money", phase: "Phase 6 — Employees, Attendance & Payroll", description: "Employees, salary, advance, PF, ESI, net salary and payment status." },
  { key: "finance", label: "GST & Finance", href: "/finance", icon: Wallet, group: "People & Money", phase: "Phase 7 — GST & Finance", description: "GST invoices, payments received, filing status and receivables." },
  { key: "daily_work", label: "Daily Work", shortLabel: "Daily work", href: "/daily-work", icon: HardHat, group: "Operations", phase: "Phase 2 — Projects & Daily Work", description: "Daily work reports, attendance, site requests and issues at each plant site." },
  { key: "approvals", label: "Approvals", href: "/approvals", icon: CheckSquare, group: "Management", phase: "Phase 0 — Foundation", description: "Everything waiting for a decision, in one place." },
  { key: "settings", label: "Settings", href: "/settings", icon: Settings, group: "Management", phase: "Phase 0 — Foundation", description: "Regions, GSTINs, service lines, roles, stages, checklists and approval rules." },
];

export const NAV_GROUP_ORDER: NavModule["group"][] = ["Overview", "Business", "People & Money", "Operations", "Management"];

export const findModule = (pathname: string): NavModule | undefined =>
  NAV_MODULES.find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`));

export const getModule = (key: string): NavModule => {
  const m = NAV_MODULES.find((x) => x.key === key);
  if (!m) throw new Error(`Unknown nav module: ${key}`);
  return m;
};
