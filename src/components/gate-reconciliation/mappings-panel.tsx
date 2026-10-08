"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Section } from "@/components/tenders/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveGateMappingAction } from "@/modules/gate-reconciliation/actions";
import type { ColumnMap, DateFormat } from "@/modules/gate-reconciliation/parse";
import type { MappingRow } from "@/modules/gate-reconciliation/queries";
import { ColumnMapEditor } from "./column-map-editor";

/** Settings-style panel: one saved column mapping per client organisation. */
export function MappingsPanel({ mappings, organisations, canEdit }: { mappings: MappingRow[]; organisations: { id: string; name: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [orgId, setOrgId] = useState("");
  const [name, setName] = useState("");
  const [map, setMap] = useState<Partial<ColumnMap>>({});
  const [format, setFormat] = useState<DateFormat>("DD-MM-YYYY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function edit(m: MappingRow) {
    setOrgId(m.organisationId);
    setName(m.name);
    setMap(m.columnMap);
    setFormat(m.dateFormat);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await saveGateMappingAction({
      organisationId: orgId, name,
      columnMap: { workerRef: map.workerRef ?? "", workerName: map.workerName ?? "", date: map.date ?? "", inTime: map.inTime ?? "", outTime: map.outTime ?? "", hours: map.hours ?? "", shift: map.shift ?? "" },
      dateFormat: format,
    });
    setBusy(false);
    if (!res.ok) {
      const fields = res.error.fieldErrors ? Object.values(res.error.fieldErrors).flat().join(" ") : "";
      setError(res.error.code === "FORBIDDEN" ? "Your role is not allowed to edit mappings." : fields || res.error.message);
      return;
    }
    toast.success("Mapping saved");
    setName("");
    setMap({});
    router.refresh();
  }

  return (
    <div className="space-y-4" data-testid="gate-mappings">
      {canEdit && (
        <Section title="Add or edit a mapping" hint="Type the column headings exactly as the client's file shows them">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="mp-org" className="mb-1 block text-xs font-medium text-muted-foreground">
                  Client organisation
                </label>
                <select
                  id="mp-org"
                  data-testid="mapping-org"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:text-sm"
                >
                  <option value="">Choose organisation</option>
                  {organisations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor="mp-name" className="mb-1 block text-xs font-medium text-muted-foreground">
                  Name
                </label>
                <Input id="mp-name" data-testid="mapping-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NTPC CLIMS export" />
              </div>
            </div>
            <ColumnMapEditor value={map} onChange={setMap} dateFormat={format} onDateFormat={setFormat} idPrefix="mp" />
            {error && (
              <p role="alert" className="rounded-md bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
                {error}
              </p>
            )}
            <Button className="min-h-11 w-full sm:w-auto" disabled={busy || !orgId || !name.trim()} onClick={save} data-testid="mapping-save">
              {busy ? "Saving…" : "Save mapping"}
            </Button>
          </div>
        </Section>
      )}

      <Section title="Saved mappings" hint="One per client organisation; used automatically on upload">
        {mappings.length === 0 ? (
          <EmptyState message="No mapping saved yet. One is saved the first time you upload a client's file." />
        ) : (
          <ul className="divide-y">
            {mappings.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="mapping-row">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {m.organisationName} · {m.name}
                  </p>
                  <p className="break-words text-xs text-muted-foreground">
                    ID “{m.columnMap.workerRef}”, date “{m.columnMap.date}” ({m.dateFormat})
                    {m.columnMap.hours ? `, hours “${m.columnMap.hours}”` : m.columnMap.inTime ? `, in/out “${m.columnMap.inTime}” / “${m.columnMap.outTime}”` : ""}
                    {m.columnMap.shift ? `, shift “${m.columnMap.shift}”` : ""}
                  </p>
                </div>
                {canEdit && (
                  <Button variant="outline" className="min-h-11 sm:min-h-8" onClick={() => edit(m)}>
                    Edit
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
