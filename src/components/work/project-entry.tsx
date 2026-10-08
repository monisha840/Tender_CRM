"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RecordForm, type FormField } from "@/components/data/record-form";
import { errorText } from "@/components/tenders/action-helpers";
import { createProjectAction, updateProjectAction } from "@/modules/projects/actions";
import type { CreateProjectRaw, UpdateProjectRaw } from "@/modules/projects/schema";
import { useDb } from "@/store/hooks";
import type { Project } from "@/types";

const CONTRACT_TYPES = [
  { value: "SERVICE", label: "Service contract (monthly)" },
  { value: "FIXED_SCOPE", label: "Fixed scope (milestones)" },
];
const BILLING_CYCLES = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "MILESTONE", label: "Milestone" },
  { value: "ON_COMPLETION", label: "On completion" },
];

function useProjectFields(edit: boolean): FormField[] {
  const db = useDb();
  return useMemo<FormField[]>(() => {
    const orgName = (id: string) => db.organisations.find((o) => o.id === id)?.shortName ?? "";
    return [
      { name: "name", label: "Project name", required: true },
      {
        name: "siteId", label: "Plant site", type: "select", required: true,
        options: db.sites.filter((s) => !s.deletedAt).map((s) => ({ value: s.id, label: `${s.name} · ${orgName(s.organisationId)}` })),
        hint: "The customer and region follow the site.",
      },
      { name: "serviceLineId", label: "Service line", type: "select", required: true, options: db.serviceLines.filter((l) => l.isActive).map((l) => ({ value: l.id, label: l.name })) },
      { name: "contractType", label: "Contract type", type: "select", required: true, options: CONTRACT_TYPES },
      { name: "billingCycle", label: "Billing cycle", type: "select", required: true, options: BILLING_CYCLES },
      { name: "workOrderNo", label: "Work order no", placeholder: "Generated if left blank" },
      { name: "workOrderDate", label: "Work order date", type: "date" },
      { name: "contractValue", label: "Contract value (₹)", type: "number", required: true },
      { name: "paymentTermsDays", label: "Payment terms (days)", type: "number", placeholder: "30" },
      { name: "startDate", label: "Start date", type: "date" },
      { name: "plannedEndDate", label: "Planned end date", type: "date" },
      {
        name: "gstRegistrationId", label: "GSTIN", type: "select",
        options: [{ value: "", label: "Default for the site's region" }, ...db.gstRegistrations.map((g) => ({ value: g.id, label: g.gstin }))],
      },
      {
        name: "statusId", label: "Status", type: "select",
        options: [{ value: "", label: "In progress (default)" }, ...db.projectStatuses.filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name }))],
      },
      {
        name: "projectManagerId", label: "Project manager", type: "select",
        options: [{ value: "", label: "Not assigned" }, ...db.employees.filter((e) => !e.deletedAt).map((e) => ({ value: e.id, label: `${e.name} (${e.code})` }))],
      },
      ...(edit ? [{ name: "reason", label: "Reason for change", type: "textarea" as const, hint: "Required when the contract value changes." }] : []),
    ];
  }, [db.organisations, db.sites, db.serviceLines, db.gstRegistrations, db.projectStatuses, db.employees, edit]);
}

export function AddProjectForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const fields = useProjectFields(false);

  const onSubmit = async (values: Record<string, string>) => {
    const res = await createProjectAction(values as unknown as CreateProjectRaw);
    if (!res.ok) return errorText(res);
    toast.success(`Project ${res.data.code} added`);
    router.refresh();
  };

  return (
    <RecordForm
      testId="project-form" open={open} onOpenChange={onOpenChange} title="Add project"
      description="For a work order received directly. A won tender is converted from the tender page instead."
      fields={fields} submitLabel="Add project" onSubmit={onSubmit}
    />
  );
}

/** Edit form for an existing project. Mount it only while editing so the fields start from the current values. */
export function EditProjectForm({ project, onOpenChange }: { project: Project; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const base = useProjectFields(true);
  const initial: Record<string, string> = {
    name: project.name,
    siteId: project.siteId,
    serviceLineId: project.serviceLineId,
    contractType: project.contractType,
    billingCycle: project.billingCycle,
    workOrderNo: project.workOrderNo,
    workOrderDate: project.workOrderDate ?? "",
    contractValue: project.contractValue,
    paymentTermsDays: String(project.paymentTermsDays),
    startDate: project.startDate ?? "",
    plannedEndDate: project.plannedEndDate ?? "",
    gstRegistrationId: project.gstRegistrationId,
    statusId: project.statusId,
    projectManagerId: project.projectManagerId ?? "",
  };
  const valueChanged = (v: Record<string, string>) => Number(v.contractValue || 0) !== Number(initial.contractValue || 0);
  const fields = base.map((f) => (f.name === "reason" ? { ...f, when: valueChanged } : { ...f, defaultValue: initial[f.name] ?? f.defaultValue }));

  const onSubmit = async (values: Record<string, string>) => {
    const res = await updateProjectAction({ ...values, id: project.id, version: project.version ?? 1 } as unknown as UpdateProjectRaw);
    if (!res.ok) return errorText(res);
    toast.success(`Project ${project.code} updated`);
    router.refresh();
  };

  return <RecordForm testId="project-edit-form" open onOpenChange={onOpenChange} title="Edit project" fields={fields} submitLabel="Save changes" onSubmit={onSubmit} />;
}
