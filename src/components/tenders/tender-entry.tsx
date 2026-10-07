"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { ImportExport } from "@/components/data/import-export";
import { RecordForm, type FormField } from "@/components/data/record-form";
import type { TenderRow } from "@/lib/data/tenders";
import { formatDate } from "@/lib/dates";
import { buildTender, csvRecordToValues, TENDER_CSV_COLUMNS, type TenderEntryValues } from "@/modules/tenders/entry";
import { useCurrentPersona, useDb } from "@/store/hooks";
import { useDataStore } from "@/store/data-store";
import type { Database } from "@/types";

export function AddTenderForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDb();
  const persona = useCurrentPersona();
  const upsert = useDataStore((s) => s.upsert);

  const fields = useMemo<FormField[]>(
    () => [
      { name: "tenderNo", label: "Tender no", required: true, placeholder: "e.g. NTPC/NIT/2026-27/101" },
      { name: "title", label: "Title", required: true },
      { name: "organisation", label: "Organisation", type: "select", required: true, options: db.organisations.map((o) => ({ value: o.id, label: o.shortName })) },
      { name: "serviceLine", label: "Service line", type: "select", required: true, options: db.serviceLines.filter((l) => l.isActive).map((l) => ({ value: l.id, label: l.name })) },
      { name: "region", label: "Region", type: "select", required: true, options: db.regions.filter((r) => r.isActive).map((r) => ({ value: r.id, label: r.name })) },
      { name: "location", label: "Location", placeholder: "Plant / site" },
      { name: "estimatedValue", label: "Estimated value (₹)", type: "number" },
      { name: "emdAmount", label: "EMD (₹)", type: "number" },
      { name: "tenderFee", label: "Tender fee (₹)", type: "number" },
      { name: "submissionDeadline", label: "Submission deadline", type: "datetime-local", required: true },
      { name: "openingDate", label: "Opening date", type: "date" },
      { name: "tenderType", label: "Tender type", type: "select", required: true, options: db.tenderTypes.filter((t) => t.isActive).map((t) => ({ value: t.id, label: t.name })) },
      { name: "owner", label: "Owner", type: "select", required: true, defaultValue: persona.user.id, options: db.users.map((u) => ({ value: u.id, label: u.name })) },
      { name: "workDescription", label: "Work description", type: "textarea" },
    ],
    [db.organisations, db.serviceLines, db.regions, db.tenderTypes, db.users, persona.user.id],
  );

  const onSubmit = (values: Record<string, string>) => {
    const res = buildTender(db, values as unknown as TenderEntryValues, persona.user.id);
    if ("error" in res) return res.error;
    res.rows.tenders.forEach((t) => upsert("tenders", t));
    res.rows.tenderStageHistory.forEach((h) => upsert("tenderStageHistory", h));
    toast.success(`Tender ${res.rows.tenders[0].tenderNo} added`);
  };

  return <RecordForm open={open} onOpenChange={onOpenChange} title="Add tender" description="Registers the tender in the first open stage." fields={fields} submitLabel="Add tender" onSubmit={onSubmit} />;
}

const HEADERS = [...TENDER_CSV_COLUMNS.map(([h]) => h), "Stage"];

export function TenderImportExport({ rows }: { rows: TenderRow[] }) {
  const db = useDb();
  const persona = useCurrentPersona();
  const upsert = useDataStore((s) => s.upsert);

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

  const onImport = (records: Record<string, string>[]) => {
    // Work on a growing copy so duplicate tender numbers inside the file are caught too.
    let working: Database = db;
    const errors: string[] = [];
    let imported = 0;
    records.forEach((rec, i) => {
      const res = buildTender(working, csvRecordToValues(rec), persona.user.id);
      if ("error" in res) {
        errors.push(`Row ${i + 2}: ${res.error}`);
        return;
      }
      res.rows.tenders.forEach((t) => upsert("tenders", t));
      res.rows.tenderStageHistory.forEach((h) => upsert("tenderStageHistory", h));
      working = { ...working, tenders: [...working.tenders, ...res.rows.tenders] };
      imported++;
    });
    return { imported, errors };
  };

  return <ImportExport filename="tenders" headers={HEADERS} rows={exportRows} onImport={onImport} />;
}
