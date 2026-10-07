"use client";

import { useMemo } from "react";
import { Hammer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import {
  getGstFilingSummary,
  listApprovals,
  listEmployees,
  listInvoices,
  listNotifications,
  listProjects,
  listSites,
  listSubcontractorAssignments,
  listTenders,
} from "@/lib/data";
import { getModule } from "@/lib/nav";
import { useCurrentPersona, useDb, useRegionFilter } from "@/store/hooks";

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
      case "subcontractors":
        return `${n(listSubcontractorAssignments(db, { region }).length, "subcontractor assignment")} in the demo data`;
      case "employees":
        return `${n(listEmployees(db, region).length, "employee")} in the demo data`;
      case "finance":
        return `${n(listInvoices(db, { region }).length, "GST invoice")}, ${getGstFilingSummary(db, region).pending} pending GST filing`;
      case "daily_work":
        return `${n(listSites(db, region).length, "plant site")} in the demo data`;
      case "approvals":
        return `${n(listApprovals(db, { region, status: "PENDING" }).length, "pending approval")} in the demo data`;
      case "notifications":
        return `${n(listNotifications(db, persona.user.id).length, "notification")} for ${persona.user.name}`;
      default:
        return `${n(db.regions.length, "region")}, ${n(db.gstRegistrations.length, "GSTIN")}, ${n(db.serviceLines.length, "service line")} and ${n(db.roles.length, "role")} configured`;
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
