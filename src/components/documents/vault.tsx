"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { RecordForm, type FormField } from "@/components/data/record-form";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import { errorText } from "@/components/tenders/action-helpers";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { createDocumentAction, deleteDocumentAction, replaceDocumentAction, updateDocumentAction } from "@/modules/documents/actions";
import type { ReplaceDocumentRaw } from "@/modules/documents/schema";
import type { VaultRow } from "@/modules/documents/queries";
import type { DocStatus } from "@/modules/documents/status";

const STATUS_LABEL: Record<DocStatus, { label: string; tone: StatusTone }> = {
  VALID: { label: "Valid", tone: "success" },
  EXPIRING: { label: "Expiring soon", tone: "warning" },
  EXPIRED: { label: "Expired", tone: "danger" },
};

export function DocStatusBadge({ status, daysLeft }: { status: DocStatus; daysLeft: number | null }) {
  const m = STATUS_LABEL[status];
  const extra = daysLeft === null ? "" : status === "EXPIRED" ? ` ${Math.abs(daysLeft)}d ago` : status === "EXPIRING" ? ` in ${daysLeft}d` : "";
  return <StatusBadge tone={m.tone} label={`${m.label}${extra}`} />;
}

type Mode = { kind: "add" } | { kind: "edit"; row: VaultRow } | { kind: "replace"; row: VaultRow } | { kind: "delete"; row: VaultRow } | null;

export function DocumentVault({ rows, types, soonDays, canCreate, canUpdate }: { rows: VaultRow[]; types: { id: string; name: string }[]; soonDays: number; canCreate: boolean; canUpdate: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [filter, setFilter] = useState<DocStatus | "ALL">("ALL");

  const counts = useMemo(() => ({ EXPIRED: rows.filter((r) => r.status === "EXPIRED").length, EXPIRING: rows.filter((r) => r.status === "EXPIRING").length, VALID: rows.filter((r) => r.status === "VALID").length }), [rows]);
  const shown = filter === "ALL" ? rows : rows.filter((r) => r.status === filter);

  const done = (message: string) => {
    toast.success(message);
    router.refresh();
  };

  const baseFields = (r?: VaultRow): FormField[] => [
    { name: "documentTypeId", label: "Document type", type: "select", required: true, defaultValue: r?.documentTypeId, options: types.map((t) => ({ value: t.id, label: t.name })) },
    { name: "title", label: "Title", required: true, defaultValue: r?.title, placeholder: "e.g. ISO 9001:2015 certificate" },
    { name: "referenceNo", label: "Certificate / reference no", defaultValue: r?.referenceNo ?? "" },
    { name: "issueDate", label: "Issue date", type: "date", defaultValue: r?.issueDate ?? "" },
    { name: "expiryDate", label: "Expiry date", type: "date", defaultValue: r?.expiryDate ?? "", hint: "Leave blank if it does not expire" },
    { name: "fileRef", label: "File name / reference", defaultValue: r?.fileRef ?? "", hint: "Upload arrives with document storage; note where the scan is kept for now" },
    { name: "notes", label: "Notes", type: "textarea", defaultValue: r?.notes ?? "" },
  ];

  const columns: DataTableColumn<VaultRow>[] = [
    { key: "title", header: "Document", mobile: "title", sortValue: (r) => r.title, cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: "type", header: "Type", sortValue: (r) => r.documentTypeName, cell: (r) => r.documentTypeName },
    { key: "ref", header: "Reference", cell: (r) => r.referenceNo ?? "—" },
    { key: "expiry", header: "Expires", sortValue: (r) => r.expiryDate ?? "9999-12-31", cell: (r) => (r.expiryDate ? formatDate(r.expiryDate) : "No expiry") },
    { key: "status", header: "Status", mobile: "badge", sortValue: (r) => r.status, cell: (r) => <DocStatusBadge status={r.status} daysLeft={r.daysLeft} /> },
    ...(canUpdate
      ? [
          {
            key: "actions",
            header: "Actions",
            cell: (r: VaultRow) => (
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" className="min-h-11 md:min-h-8" onClick={() => setMode({ kind: "replace", row: r })} data-testid="doc-replace">
                  <RefreshCw data-icon="inline-start" aria-hidden="true" />
                  Replace
                </Button>
                <Button size="sm" variant="ghost" className="min-h-11 md:min-h-8" onClick={() => setMode({ kind: "edit", row: r })} data-testid="doc-edit">
                  <Pencil data-icon="inline-start" aria-hidden="true" />
                  Edit
                </Button>
                <Button size="sm" variant="ghost" className="min-h-11 md:min-h-8" onClick={() => setMode({ kind: "delete", row: r })} data-testid="doc-delete">
                  <Trash2 data-icon="inline-start" aria-hidden="true" />
                  Remove
                </Button>
              </div>
            ),
          } satisfies DataTableColumn<VaultRow>,
        ]
      : []),
  ];

  const filterButton = (key: DocStatus | "ALL", label: string) => (
    <Button key={key} size="sm" variant={filter === key ? "default" : "outline"} className="min-h-11 md:min-h-8" aria-pressed={filter === key} onClick={() => setFilter(key)} data-testid={`doc-filter-${key.toLowerCase()}`}>
      {label}
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Document vault"
        description={`Company certificates with expiry. Expiring soon = within ${soonDays} days.`}
        primaryAction={canCreate ? { label: "Add document", icon: Plus, onClick: () => setMode({ kind: "add" }), testId: "doc-add" } : undefined}
      />

      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
        <KpiTile label="Expired" value={String(counts.EXPIRED)} hint="Renew now" />
        <KpiTile label="Expiring soon" value={String(counts.EXPIRING)} hint={`Within ${soonDays} days`} />
        <KpiTile label="Valid" value={String(counts.VALID)} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-surface">
          <EmptyState icon={FileCheck2} message="No company documents yet. Add the GST, PAN, ISO, labour licence and other certificates here." action={canCreate ? { label: "Add document", onClick: () => setMode({ kind: "add" }) } : undefined} />
        </div>
      ) : (
        <DataTable
          caption="Company documents"
          columns={columns}
          rows={shown}
          getRowId={(r) => r.id}
          getRowTestId={(r) => `doc-row-${r.id}`}
          search={{ placeholder: "Search documents", getText: (r) => `${r.title} ${r.documentTypeName} ${r.referenceNo ?? ""}` }}
          toolbar={
            <div className="flex flex-wrap gap-2">
              {filterButton("ALL", "All")}
              {filterButton("EXPIRED", "Expired")}
              {filterButton("EXPIRING", "Expiring soon")}
              {filterButton("VALID", "Valid")}
            </div>
          }
          emptyMessage="No documents with this status."
        />
      )}

      {mode?.kind === "add" && (
        <RecordForm
          open
          onOpenChange={(o) => !o && setMode(null)}
          testId="doc-form"
          title="Add document"
          fields={baseFields()}
          onSubmit={async (v) => {
            const res = await createDocumentAction(v as never);
            if (!res.ok) return errorText(res);
            done("Document added");
          }}
        />
      )}
      {mode?.kind === "edit" && (
        <RecordForm
          key={mode.row.id}
          open
          onOpenChange={(o) => !o && setMode(null)}
          testId="doc-form"
          title="Edit document"
          fields={baseFields(mode.row)}
          onSubmit={async (v) => {
            const res = await updateDocumentAction({ ...(v as never as Record<string, string>), id: mode.row.id, version: mode.row.version } as never);
            if (!res.ok) return errorText(res);
            done("Document updated");
          }}
        />
      )}
      {mode?.kind === "replace" && (
        <RecordForm
          key={`r-${mode.row.id}`}
          open
          onOpenChange={(o) => !o && setMode(null)}
          testId="doc-replace-form"
          title={`Replace ${mode.row.title}`}
          description="Record the renewed certificate. The previous dates stay in the audit trail."
          fields={[
            { name: "referenceNo", label: "New certificate / reference no", defaultValue: mode.row.referenceNo ?? "" },
            { name: "issueDate", label: "Issue date", type: "date", required: true },
            { name: "expiryDate", label: "New expiry date", type: "date", hint: "Leave blank if it does not expire" },
            { name: "fileRef", label: "File name / reference", defaultValue: "" },
            { name: "reason", label: "Reason", required: true, defaultValue: "Renewed", placeholder: "e.g. Renewed for 2026-29" },
          ]}
          onSubmit={async (v) => {
            const res = await replaceDocumentAction({ ...v, id: mode.row.id, version: mode.row.version } as ReplaceDocumentRaw);
            if (!res.ok) return errorText(res);
            done("Document replaced");
          }}
        />
      )}
      {mode?.kind === "delete" && (
        <ReasonDialog
          testId="doc-delete-dialog"
          open
          onOpenChange={(o) => !o && setMode(null)}
          title="Remove document"
          description={`${mode.row.title} is hidden from the vault. The record stays in the audit trail.`}
          placeholder="Why is this being removed?"
          confirmLabel="Remove document"
          onConfirm={async (reason) => {
            const res = await deleteDocumentAction({ id: mode.row.id, version: mode.row.version, reason });
            if (!res.ok) return errorText(res);
            done("Document removed");
          }}
        />
      )}
    </>
  );
}
