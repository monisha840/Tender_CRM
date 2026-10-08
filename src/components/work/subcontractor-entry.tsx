"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RecordForm, type FormField } from "@/components/data/record-form";
import { errorText } from "@/components/tenders/action-helpers";
import { createSubcontractorAction, updateSubcontractorAction } from "@/modules/subcontractors/actions";
import type { CreateSubcontractorRaw, UpdateSubcontractorRaw } from "@/modules/subcontractors/schema";
import { useDb } from "@/store/hooks";
import type { Party, Subcontractor } from "@/types";

const STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "BLACKLISTED", label: "Blacklisted" },
];

function useSubcontractorFields(edit: boolean): FormField[] {
  const db = useDb();
  return useMemo<FormField[]>(
    () => [
      { name: "name", label: "Name", required: true },
      { name: "tradeCategory", label: "Trade category", required: true, placeholder: "e.g. Civil, Painting, Stone picking" },
      { name: "contactName", label: "Contact person", required: true },
      { name: "phone", label: "Phone", type: "tel", required: true },
      { name: "email", label: "Email", type: "email" },
      { name: "pan", label: "PAN", required: true, placeholder: "ABCDE1234F" },
      { name: "gstin", label: "GSTIN", placeholder: "Optional, 15 characters", hint: "Must match the PAN and the state." },
      { name: "stateId", label: "State", type: "select", required: true, options: db.states.map((s) => ({ value: s.id, label: s.name })) },
      { name: "address", label: "Address", type: "textarea" },
      { name: "isLabourSupplier", label: "Labour supplier", type: "select", defaultValue: "no", options: [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }] },
      ...(edit ? [{ name: "status", label: "Status", type: "select" as const, required: true, options: STATUSES }] : []),
    ],
    [db.states, edit],
  );
}

export function AddSubcontractorForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const fields = useSubcontractorFields(false);

  const onSubmit = async (values: Record<string, string>) => {
    const res = await createSubcontractorAction(values as unknown as CreateSubcontractorRaw);
    if (!res.ok) return errorText(res);
    toast.success(`Subcontractor ${res.data.name} added`);
    router.refresh();
  };

  return (
    <RecordForm testId="subcontractor-form" open={open} onOpenChange={onOpenChange} title="Add subcontractor" fields={fields} submitLabel="Add subcontractor" onSubmit={onSubmit} />
  );
}

/** Edit form for an existing subcontractor. Mount it only while editing so the fields start from the current values. */
export function EditSubcontractorForm({ party, subcontractor, onOpenChange }: { party: Party; subcontractor: Subcontractor; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const base = useSubcontractorFields(true);
  const initial: Record<string, string> = {
    name: party.name,
    tradeCategory: subcontractor.tradeCategory,
    contactName: party.contactName,
    phone: party.phone,
    email: party.email ?? "",
    pan: party.pan,
    gstin: party.gstin ?? "",
    stateId: party.stateId,
    address: party.address,
    isLabourSupplier: subcontractor.isLabourSupplier ? "yes" : "no",
    status: subcontractor.status,
  };
  const fields = base.map((f) => ({ ...f, defaultValue: initial[f.name] ?? f.defaultValue }));

  const onSubmit = async (values: Record<string, string>) => {
    const res = await updateSubcontractorAction({ ...values, id: subcontractor.id, version: subcontractor.version ?? 1 } as unknown as UpdateSubcontractorRaw);
    if (!res.ok) return errorText(res);
    toast.success(`${values.name} updated`);
    router.refresh();
  };

  return <RecordForm testId="subcontractor-edit-form" open onOpenChange={onOpenChange} title="Edit subcontractor" fields={fields} submitLabel="Save changes" onSubmit={onSubmit} />;
}
