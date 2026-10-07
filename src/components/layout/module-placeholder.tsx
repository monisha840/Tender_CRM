"use client";

import { useMemo } from "react";
import { Hammer } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { getModule } from "@/lib/nav";
import { useCurrentPersona, useDb, useRegionFilter } from "@/store/hooks";
import {
  listApprovals,
  listAuditLogs,
  listEmployees,
  listGstTransactions,
  listNotifications,
  listPayrollRuns,
  listProjects,
  listPurchaseRequests,
  listReceivables,
  listSites,
  listSubcontractors,
  listTenders,
} from "@/lib/data";

/** Foundation placeholder for a module whose real screens are built in a later phase. */
export function ModulePlaceholder({ moduleKey }: { moduleKey: string }) {
  const mod = getModule(moduleKey);
  const db = useDb();
  const persona = useCurrentPersona();
  const { region } = useRegionFilter();

  // A one-line proof that the store and data-access layer are wired up for this module.
  const demoData = useMemo(() => {
    const n = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
    switch (moduleKey) {
      case "dashboard":
        return `${n(listTenders(db, { region }).length, "tender")} and ${n(listProjects(db, region).length, "project")} in the demo data`;
      case "tenders":
        return `${n(listTenders(db, { region }).length, "tender")} in the demo data`;
      case "projects":
        return `${n(listProjects(db, region).length, "project")} in the demo data`;
      case "sites":
        return `${n(listSites(db, region).length, "site")} in the demo data`;
      case "people":
        return `${n(listEmployees(db, region).length, "employee")} in the demo data`;
      case "subcontractors":
        return `${n(listSubcontractors(db, region).length, "subcontractor")} in the demo data`;
      case "attendance":
        return `${n(listPayrollRuns(db, region).length, "payroll run")} in the demo data`;
      case "purchases":
        return `${n(listPurchaseRequests(db, region).length, "purchase request")} in the demo data`;
      case "accounts":
        return `${n(listReceivables(db, region).length, "unpaid RA bill")} in the demo data`;
      case "gst":
        return `${n(listGstTransactions(db).length, "GST transaction")} in the demo data`;
      case "epf":
        return `${n(db.payslips.length, "payslip")} with EPF figures in the demo data`;
      case "reports":
        return `${n(listAuditLogs(db, { region }).length, "audit entry")} available to report on`;
      case "approvals":
        return `${n(listApprovals(db, { region, status: "PENDING" }).length, "pending approval")} in the demo data`;
      case "notifications":
        return `${n(listNotifications(db, persona.user.id).length, "notification")} for ${persona.user.name}`;
      default:
        return `${n(db.regions.length, "region")}, ${n(db.gstRegistrations.length, "GSTIN")} and ${n(db.roles.length, "role")} configured`;
    }
  }, [db, moduleKey, region, persona.user.id, persona.user.name]);

  return (
    <>
      <PageHeader title={mod.label} description={mod.description} />
      <div className="rounded-lg border bg-surface">
        <EmptyState icon={Hammer} message={`Screens for ${mod.label} arrive in ${mod.phase}. ${demoData}.`} action={{ label: "Back to my home", href: persona.role.homePath }} />
      </div>
    </>
  );
}
