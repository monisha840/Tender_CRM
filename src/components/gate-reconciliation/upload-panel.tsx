"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { Section } from "@/components/tenders/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadGateFileAction } from "@/modules/gate-reconciliation/actions";
import { autoDetectMapping, csvToGrid, parseGateGrid, type ColumnMap, type DateFormat } from "@/modules/gate-reconciliation/parse";
import { parseXlsx } from "@/modules/gate-reconciliation/xlsx";
import type { MappingRow, ProjectOption } from "@/modules/gate-reconciliation/queries";
import { ColumnMapEditor } from "./column-map-editor";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:text-sm";

/** Previous calendar month in IST as YYYY-MM (the usual month being reconciled). */
function defaultMonth(): string {
  const d = new Date(Date.now() + 330 * 60_000);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

const mapComplete = (m: Partial<ColumnMap>): m is ColumnMap => !!(m.workerRef && m.date && (m.hours || (m.inTime && m.outTime)));

export function UploadPanel({ projects, mappings, canCreate }: { projects: ProjectOption[]; mappings: MappingRow[]; canCreate: boolean }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [month, setMonth] = useState(defaultMonth());
  const [fileName, setFileName] = useState("");
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Partial<ColumnMap>>({});
  const [dateFormat, setDateFormat] = useState<DateFormat>("DD-MM-YYYY");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const project = projects.find((p) => p.id === projectId);
  const saved = useMemo(() => mappings.find((m) => m.organisationId === project?.organisationId), [mappings, project]);
  const headers = grid?.[0];

  /** Prefer the client's saved mapping when the file has all its columns; otherwise guess from the headings. */
  function applyMapping(g: string[][], p: ProjectOption | undefined) {
    const h = g[0] ?? [];
    const sv = mappings.find((m) => m.organisationId === p?.organisationId);
    const fits = sv && Object.values(sv.columnMap).filter(Boolean).every((c) => h.some((x) => x.trim().toLowerCase() === String(c).trim().toLowerCase()));
    if (sv && fits) {
      // Use the file's own spelling of each heading.
      const own = (c?: string | null) => (c ? (h.find((x) => x.trim().toLowerCase() === c.trim().toLowerCase()) ?? c) : "");
      const m = sv.columnMap;
      setMap({ workerRef: own(m.workerRef), workerName: own(m.workerName), date: own(m.date), inTime: own(m.inTime), outTime: own(m.outTime), hours: own(m.hours), shift: own(m.shift) });
      setDateFormat(sv.dateFormat);
    } else {
      setMap(autoDetectMapping(h));
    }
  }

  async function onFile(file: File | undefined) {
    setError(null);
    setGrid(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const g = /\.xlsx$/i.test(file.name) ? await parseXlsx(await file.arrayBuffer()) : csvToGrid(await file.text());
      if (g.length < 2) {
        setError("The file has no data rows.");
        return;
      }
      setGrid(g);
      applyMapping(g, project);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this file. Use a CSV or .xlsx export.");
    }
  }

  const preview = useMemo(() => (grid && mapComplete(map) ? parseGateGrid(grid, map, dateFormat) : null), [grid, map, dateFormat]);
  const ready = !!grid && mapComplete(map) && !!preview && preview.rows.length > 0 && !!projectId && /^\d{4}-\d{2}$/.test(month);

  async function submit() {
    if (!grid || !mapComplete(map)) return;
    setBusy(true);
    setError(null);
    const res = await uploadGateFileAction({
      projectId, periodMonth: month, fileName: fileName || "gate-attendance.csv", grid,
      columnMap: { workerRef: map.workerRef, workerName: map.workerName ?? "", date: map.date, inTime: map.inTime ?? "", outTime: map.outTime ?? "", hours: map.hours ?? "", shift: map.shift ?? "" },
      dateFormat, saveMapping: remember,
    });
    setBusy(false);
    if (!res.ok) {
      const fields = res.error.fieldErrors ? Object.values(res.error.fieldErrors).flat().join(" ") : "";
      setError(res.error.code === "FORBIDDEN" ? "Your role is not allowed to upload gate files." : fields || res.error.message);
      return;
    }
    toast.success(`${res.data.matchedPct}% matched, ${res.data.exceptions} exceptions`);
    router.push(`/gate-reconciliation/${encodeURIComponent(res.data.uploadId)}`);
    router.refresh();
  }

  if (!canCreate) {
    return (
      <Section title="Upload a gate file">
        <p className="text-sm text-muted-foreground">Your role can view reconciliations but not upload gate files.</p>
      </Section>
    );
  }

  return (
    <Section title="Upload a gate file" hint="Choose the project and month, then the client's CSV or Excel export" className="mb-4">
      <div className="space-y-4" data-testid="gate-upload-panel">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0">
            <label htmlFor="gate-project" className="mb-1 block text-xs font-medium text-muted-foreground">
              Project
            </label>
            <select
              id="gate-project"
              data-testid="gate-project"
              className={selectClass}
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                if (grid) applyMapping(grid, projects.find((p) => p.id === e.target.value));
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor="gate-month" className="mb-1 block text-xs font-medium text-muted-foreground">
              Month
            </label>
            <Input id="gate-month" data-testid="gate-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div className="min-w-0">
            <label htmlFor="gate-file" className="mb-1 block text-xs font-medium text-muted-foreground">
              Gate file (.csv or .xlsx)
            </label>
            <Input id="gate-file" data-testid="gate-file" type="file" accept=".csv,.xlsx,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
        </div>

        {grid && (
          <>
            <div>
              <h3 className="mb-1 text-sm font-semibold">Match the columns</h3>
              <p className="mb-2 text-xs text-muted-foreground">
                {saved && project ? `Using the saved mapping for ${project.organisationName} where the file allows.` : "Pick which column holds each field; we will remember it for this client."}
              </p>
              <ColumnMapEditor value={map} onChange={setMap} headers={headers} dateFormat={dateFormat} onDateFormat={setDateFormat} idPrefix="gate-map" />
            </div>

            {preview && (
              <div data-testid="gate-preview" className="rounded-md border bg-background p-3 text-sm">
                <p>
                  <span className="font-medium">{preview.rows.length.toLocaleString("en-IN")}</span> rows read
                  {preview.issues.length > 0 && <span className="text-status-warning"> · {preview.issues.length} skipped (first: line {preview.issues[0].line}, {preview.issues[0].message})</span>}
                  {preview.missingColumns.length > 0 && <span className="text-status-danger"> · missing columns: {preview.missingColumns.join(", ")}</span>}
                </p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Worker</th>
                        <th className="py-1 pr-3 font-medium">Name</th>
                        <th className="py-1 pr-3 font-medium">Date</th>
                        <th className="py-1 pr-3 text-right font-medium">Hours</th>
                        <th className="py-1 font-medium">Shift</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 4).map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-1 pr-3">{r.workerRef}</td>
                          <td className="py-1 pr-3">{r.workerName ?? "—"}</td>
                          <td className="tabular py-1 pr-3">{r.date}</td>
                          <td className="tabular py-1 pr-3 text-right">{r.hours ?? "—"}</td>
                          <td className="py-1">{r.shift ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-[var(--accent-strong)]" />
              Remember this mapping for {project?.organisationName ?? "this client"}
            </label>
          </>
        )}

        {error && (
          <p role="alert" data-testid="gate-error" className="rounded-md bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </p>
        )}

        <div className="flex">
          <Button className="min-h-11 w-full sm:w-auto" onClick={submit} disabled={!ready || busy} data-testid="gate-upload">
            <FileUp data-icon="inline-start" aria-hidden="true" />
            {busy ? "Reconciling…" : "Upload and reconcile"}
          </Button>
        </div>
      </div>
    </Section>
  );
}
