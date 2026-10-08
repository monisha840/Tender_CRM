"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ListChecks, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { RecordForm, type FormField } from "@/components/data/record-form";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { errorText } from "@/components/tenders/action-helpers";
import { Button } from "@/components/ui/button";
import { saveBillReadinessTemplateItemAction, seedBillReadinessTemplateAction } from "@/modules/bill-readiness/actions";

export interface TemplateRow {
  id: string;
  code: string;
  label: string;
  isMandatory: boolean;
  sortOrder: number;
  isActive: boolean;
}

export function TemplateAdmin({ rows }: { rows: TemplateRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<TemplateRow | "new" | null>(null);

  const fields = (r?: TemplateRow): FormField[] => [
    { name: "label", label: "Item", required: true, defaultValue: r?.label, placeholder: "e.g. Wage register" },
    { name: "code", label: "Code", required: true, defaultValue: r?.code, hint: "Capital letters, digits and underscores" },
    { name: "sortOrder", label: "Order", type: "number", defaultValue: String(r?.sortOrder ?? (rows.length + 1) * 10) },
    { name: "isMandatory", label: "Mandatory", type: "select", required: true, defaultValue: r && !r.isMandatory ? "no" : "yes", options: [{ value: "yes", label: "Mandatory" }, { value: "no", label: "Optional" }] },
    { name: "isActive", label: "In use", type: "select", required: true, defaultValue: r && !r.isActive ? "no" : "yes", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No (hidden)" }] },
  ];

  const columns: DataTableColumn<TemplateRow>[] = [
    { key: "label", header: "Item", mobile: "title", sortValue: (r) => r.sortOrder, cell: (r) => <span className="font-medium">{r.label}</span> },
    { key: "code", header: "Code", cell: (r) => r.code },
    { key: "mandatory", header: "Mandatory", cell: (r) => (r.isMandatory ? "Yes" : "Optional") },
    { key: "status", header: "Status", mobile: "badge", cell: (r) => <StatusBadge status={r.isActive ? "ACTIVE" : "INACTIVE"} /> },
    {
      key: "edit",
      header: "",
      cell: (r) => (
        <Button size="sm" variant="ghost" className="min-h-11 md:min-h-8" onClick={() => setEditing(r)} data-testid="br-template-edit">
          <Pencil data-icon="inline-start" aria-hidden="true" />
          Edit
        </Button>
      ),
    },
  ];

  async function seed() {
    const res = await seedBillReadinessTemplateAction();
    if (!res.ok) return void toast.error(errorText(res));
    toast.success("Standard items added");
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href="/bill-readiness" />}>
        <ArrowLeft data-icon="inline-start" aria-hidden="true" />
        Bill readiness
      </Button>
      <PageHeader
        title="Checklist items"
        description="What every project needs each month before the bill is submitted. “Gate attendance reconciled” is always added automatically."
        primaryAction={{ label: "Add item", icon: Plus, onClick: () => setEditing("new"), testId: "br-template-add" }}
        secondaryActions={[{ label: "Load standard items", onClick: seed, testId: "br-template-seed" }]}
      />
      {rows.length === 0 ? (
        <div className="rounded-lg border bg-surface">
          <EmptyState icon={ListChecks} message="No checklist items yet. Load the standard six (wage register, PF and ESI challans, attendance sheet, bank wage proof, labour licence)." action={{ label: "Load standard items", onClick: seed }} />
        </div>
      ) : (
        <DataTable caption="Bill readiness checklist items" columns={columns} rows={rows} getRowId={(r) => r.id} getRowTestId={(r) => `br-template-${r.code}`} />
      )}
      {editing && (
        <RecordForm
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          testId="br-template-form"
          title={editing === "new" ? "Add checklist item" : "Edit checklist item"}
          fields={fields(editing === "new" ? undefined : editing)}
          onSubmit={async (v) => {
            const res = await saveBillReadinessTemplateItemAction({
              id: editing === "new" ? undefined : editing.id,
              code: v.code, label: v.label, sortOrder: Number(v.sortOrder) || 0, isMandatory: v.isMandatory === "yes", isActive: v.isActive === "yes",
            });
            if (!res.ok) return errorText(res);
            toast.success("Checklist item saved");
            router.refresh();
          }}
        />
      )}
    </>
  );
}
