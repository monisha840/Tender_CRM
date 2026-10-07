"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImportExport } from "@/components/data/import-export";
import { RecordForm, type FormField } from "@/components/data/record-form";
import type { TenderRow } from "@/lib/data/tenders";
import { formatDate } from "@/lib/dates";
import { createTenderAction, updateTenderAction } from "@/modules/tenders/actions";
import type { CreateTenderRaw, UpdateTenderRaw } from "@/modules/tenders/schema";
import { buildTender, csvRecordToValues, TENDER_CSV_COLUMNS } from "@/modules/tenders/entry";
import { useCurrentPersona, useDb } from "@/store/hooks";
import type { Database, Tender } from "@/types";
import { errorText, toIstLocalInput } from "./action-helpers";

function useTenderFields(edit: boolean): FormField[] {
  const db = useDb();
  const persona = useCurrentPersona();
  return useMemo<FormField[]>(
    () => [
      { name: "tenderNo", label: "Tender no", required: true, placeholder: "e.g. NTPC/NIT/2026-27/101" },
      { name: "title", label: "Title", required: true },
      { name: "organisationId", label: "Organisation", type: "select", required: true, options: db.organisations.map((o) => ({ value: o.id, label: o.shortName })) },
      { name: "serviceLineId", label: "Service line", type: "select", required: true, options: db.serviceLines.filter((l) => l.isActive).map((l) => ({ value: l.id, label: l.name })) },
      { name: "regionId", label: "Region", type: "select", required: true, options: db.regions.filter((r) => r.isActive).map((r) => ({ value: r.id, label: r.name })) },
      { name: "location", label: "Location", placeholder: "Plant / site" },
      { name: "estimatedValue", label: "Estimated value (₹)", type: "number" },
      { name: "emdAmount", label: "EMD (₹)", type: "number" },
      { name: "tenderFee", label: "Tender fee (₹)", type: "number" },
      { name: "submissionDeadline", label: "Submission deadline", type: "datetime-local", required: true },
      { name: "openingDate", label: "Opening date", type: "date" },
      { name: "tenderTypeId", label: "Tender type", type: "select", required: true, options: db.tenderTypes.filter((t) => t.isActive).map((t) => ({ value: t.id, label: t.name })) },
      { name: "ownerId", label: "Owner", type: "select", required: true, defaultValue: persona.user.id, options: db.users.map((u) => ({ value: u.id, label: u.name })) },
      { name: "workDescription", label: "Work description", type: "textarea" },
      ...(edit ? [{ name: "reason", label: "Reason for change", type: "textarea" as const, hint: "Required when the estimated value, EMD or tender fee changes." }] : []),
    ],
    [db.organisations, db.serviceLines, db.regions, db.tenderTypes, db.users, persona.user.id, edit],
  );
}

export function AddTenderForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const fields = useTenderFields(false);

  const onSubmit = async (values: Record<string, string>) => {
    const res = await createTenderAction(values as unknown as CreateTenderRaw);
    if (!res.ok) return errorText(res);
    toast.success(`Tender ${res.data.tenderNo} added`);
    router.refresh();
  };

  return (
    <RecordForm testId="tender-form" open={open} onOpenChange={onOpenChange} title="Add tender" description="Registers the tender in the first open stage." fields={fields} submitLabel="Add tender" onSubmit={onSubmit} />
  );
}

/** Edit form for an existing tender. Mount it only while editing so the fields start from the current values. */
export function EditTenderForm({ tender, onOpenChange }: { tender: Tender; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const base = useTenderFields(true);
  const initial: Record<string, string> = {
    tenderNo: tender.tenderNo,
    title: tender.title,
    organisationId: tender.organisationId,
    serviceLineId: tender.serviceLineId,
    regionId: tender.regionId,
    location: tender.location,
    estimatedValue: tender.estimatedValue,
    emdAmount: tender.emdAmount,
    tenderFee: tender.tenderFee,
    submissionDeadline: toIstLocalInput(tender.submissionDeadlineAt),
    openingDate: tender.openingDate,
    tenderTypeId: tender.tenderTypeId,
    ownerId: tender.ownerId,
    workDescription: tender.workDescription,
  };
  const amountsChanged = (v: Record<string, string>) => ["estimatedValue", "emdAmount", "tenderFee"].some((k) => Number(v[k] || 0) !== Number(initial[k] || 0));
  const fields = base.map((f) => (f.name === "reason" ? { ...f, when: amountsChanged } : { ...f, defaultValue: initial[f.name] ?? f.defaultValue }));

  const onSubmit = async (values: Record<string, string>) => {
    const res = await updateTenderAction({ ...values, id: tender.id, version: tender.version ?? 1 } as unknown as UpdateTenderRaw);
    if (!res.ok) return errorText(res);
    toast.success(`Tender ${values.tenderNo} updated`);
    router.refresh();
  };

  return <RecordForm testId="tender-edit-form" open onOpenChange={onOpenChange} title="Edit tender" fields={fields} submitLabel="Save changes" onSubmit={onSubmit} />;
}

const HEADERS = [...TENDER_CSV_COLUMNS.map(([h]) => h), "Stage"];

export function TenderImportExport({ rows }: { rows: TenderRow[] }) {
  const db = useDb();
  const persona = useCurrentPersona();
  const router = useRouter();

  const exportRows = rows.map((r) => {
    const t = r.tender;
    const typeName = db.tenderTypes.find((x) => x.id === t.tenderTypeId)?.name ?? "";
    const vals: Record<string, string> = {
      "Tender No": t.tenderNo,
      Title: t.title,
      Organisation: r.organisationShort,
      "Service Line": r.serviceLineName,
      Region: r.regionName,
      Location: t.location,
      "Estimated Value": t.estimatedValue,
      EMD: t.emdAmount,
      "Tender Fee": t.tenderFee,
      "Submission Deadline": formatDate(t.submissionDeadlineAt),
      "Opening Date": formatDate(t.openingDate),
      "Tender Type": typeName,
      "Work Description": t.workDescription,
      Stage: r.stage.name,
    };
    return HEADERS.map((h) => vals[h]);
  });

  /** Each row is validated and resolved locally (names to ids), then saved through the server action one by one. */
  const onImport = async (records: Record<string, string>[]) => {
    let working: Database = db; // grows so duplicate tender numbers inside the file are caught too
    const errors: string[] = [];
    let imported = 0;
    for (const [i, rec] of records.entries()) {
      const res = buildTender(working, csvRecordToValues(rec), persona.user.id);
      if ("error" in res) {
        errors.push(`Row ${i + 2}: ${res.error}`);
        continue;
      }
      const t = res.rows.tenders[0];
      const saved = await createTenderAction({
        tenderNo: t.tenderNo,
        title: t.title,
        organisationId: t.organisationId,
        serviceLineId: t.serviceLineId,
        regionId: t.regionId,
        tenderTypeId: t.tenderTypeId,
        location: t.location,
        workDescription: t.workDescription,
        estimatedValue: t.estimatedValue,
        emdAmount: t.emdAmount,
        tenderFee: t.tenderFee,
        submissionDeadline: toIstLocalInput(t.submissionDeadlineAt),
        openingDate: t.openingDate,
        ownerId: t.ownerId,
      });
      if (!saved.ok) {
        errors.push(`Row ${i + 2}: ${errorText(saved)}`);
        continue;
      }
      working = { ...working, tenders: [...working.tenders, t] };
      imported++;
    }
    if (imported > 0) router.refresh();
    return { imported, errors };
  };

  return <ImportExport filename="tenders" headers={HEADERS} rows={exportRows} onImport={onImport} />;
}
