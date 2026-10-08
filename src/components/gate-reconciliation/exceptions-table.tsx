"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { resolveGateExceptionAction } from "@/modules/gate-reconciliation/actions";
import { EXCEPTION_KINDS, KIND_LABEL, type ExceptionKind } from "@/modules/gate-reconciliation/match";
import type { ExceptionRow } from "@/modules/gate-reconciliation/queries";
import { RESOLUTIONS, type ResolutionCode } from "@/modules/gate-reconciliation/schema";

const h = (n: number | null) => (n === null ? "—" : Number.isInteger(n) ? n.toFixed(1) : String(n));

function ResolveSheet({ row, onClose }: { row: ExceptionRow | null; onClose: () => void }) {
  const router = useRouter();
  const [resolution, setResolution] = useState<ResolutionCode>("CORRECTED_OURS");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!row) return;
    setBusy(true);
    setError(null);
    const res = await resolveGateExceptionAction({ id: row.id, version: row.version, resolution, reason: reason.trim() });
    setBusy(false);
    if (!res.ok) {
      const fields = res.error.fieldErrors ? Object.values(res.error.fieldErrors).flat().join(" ") : "";
      setError(res.error.code === "FORBIDDEN" ? "Your role is not allowed to resolve exceptions." : fields || res.error.message);
      return;
    }
    toast.success("Exception resolved");
    setReason("");
    onClose();
    router.refresh();
  }

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-xl p-4 sm:max-w-lg">
        <SheetHeader className="p-0">
          <SheetTitle>Resolve exception</SheetTitle>
          <SheetDescription>{row ? `${row.workerRef} · ${formatDate(row.date)} · ${KIND_LABEL[row.kind as ExceptionKind] ?? row.kind}` : ""}</SheetDescription>
        </SheetHeader>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">What was done</legend>
          {(Object.keys(RESOLUTIONS) as ResolutionCode[]).map((code) => (
            <label key={code} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="radio" name="gate-resolution" checked={resolution === code} onChange={() => setResolution(code)} data-testid={`gate-resolution-${code}`} className="size-4 accent-[var(--accent-strong)]" />
              {RESOLUTIONS[code]}
            </label>
          ))}
        </fieldset>
        <label className="block text-sm font-medium" htmlFor="gate-resolve-reason">
          Reason <span className="text-status-danger">(required)</span>
        </label>
        <textarea
          id="gate-resolve-reason"
          data-testid="gate-resolve-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Supervisor confirmed he was on leave; gate card was used by a colleague"
          className="w-full rounded-md border bg-surface p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
        />
        {error && (
          <p role="alert" className="rounded-md bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </p>
        )}
        <SheetFooter className="p-0">
          <Button className="min-h-11" disabled={busy || reason.trim().length < 3} onClick={confirm} data-testid="gate-resolve-confirm">
            {busy ? "Saving…" : "Mark resolved"}
          </Button>
          <Button variant="outline" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function ExceptionsTable({ exceptions, canResolve }: { exceptions: ExceptionRow[]; canResolve: boolean }) {
  const [kind, setKind] = useState<ExceptionKind | "ALL">("ALL");
  const [open, setOpen] = useState(true);
  const [target, setTarget] = useState<ExceptionRow | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    exceptions.forEach((e) => (c[e.kind] = (c[e.kind] ?? 0) + 1));
    return c;
  }, [exceptions]);
  const shown = exceptions.filter((e) => (kind === "ALL" || e.kind === kind) && (!open || e.status === "OPEN"));

  const chip = (k: ExceptionKind | "ALL", label: string, n: number) => (
    <button
      key={k}
      type="button"
      onClick={() => setKind(k)}
      aria-pressed={kind === k}
      data-testid={`gate-kind-${k}`}
      className={cn("min-h-11 rounded-md border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8", kind === k ? "border-accent-strong bg-accent-subtle font-medium" : "bg-surface hover:bg-accent-subtle")}
    >
      {label} <span className="tabular text-muted-foreground" data-testid={`gate-kind-count-${k}`}>{n}</span>
    </button>
  );

  return (
    <div data-testid="gate-exceptions">
      <div className="mb-3 flex flex-wrap gap-2">
        {chip("ALL", "All", exceptions.length)}
        {EXCEPTION_KINDS.map((k) => chip(k, KIND_LABEL[k], counts[k] ?? 0))}
      </div>
      <label className="mb-3 flex min-h-11 items-center gap-2 text-sm md:min-h-0">
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} className="size-4 accent-[var(--accent-strong)]" />
        Show open only
      </label>

      {shown.length === 0 ? (
        <EmptyState message={exceptions.length === 0 ? "No exceptions: the gate file and our attendance agree." : "Nothing matches this filter."} />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-background text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Worker</th>
                  <th className="px-3 py-2 font-medium">Issue</th>
                  <th className="px-3 py-2 text-right font-medium">Ours</th>
                  <th className="px-3 py-2 text-right font-medium">Gate</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id} className="border-b align-top last:border-b-0" data-testid="gate-exception-row" data-kind={e.kind} data-status={e.status}>
                    <td className="tabular px-3 py-2 whitespace-nowrap">{formatDate(e.date)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{e.workerRef}</div>
                      <div className="text-xs text-muted-foreground">{e.workerName ?? ""}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{KIND_LABEL[e.kind as ExceptionKind] ?? e.kind}</div>
                      <div className="text-xs text-muted-foreground">{e.status === "RESOLVED" && e.resolution ? e.resolution : e.reason}</div>
                    </td>
                    <td className="tabular px-3 py-2 text-right">{h(e.ourHours)}</td>
                    <td className="tabular px-3 py-2 text-right">{h(e.theirHours)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={e.status === "OPEN" ? "PENDING" : "RESOLVED"} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canResolve && e.status === "OPEN" && (
                        <Button variant="outline" size="sm" onClick={() => setTarget(e)} data-testid="gate-resolve">
                          Resolve
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {shown.map((e) => (
              <li key={e.id} className="rounded-lg border bg-surface p-3" data-testid="gate-exception-row" data-kind={e.kind} data-status={e.status}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{e.workerRef}{e.workerName ? ` · ${e.workerName}` : ""}</p>
                    <p className="tabular text-xs text-muted-foreground">{formatDate(e.date)}</p>
                  </div>
                  <StatusBadge status={e.status === "OPEN" ? "PENDING" : "RESOLVED"} />
                </div>
                <p className="mt-2 text-sm">{KIND_LABEL[e.kind as ExceptionKind] ?? e.kind}</p>
                <p className="text-xs text-muted-foreground">{e.status === "RESOLVED" && e.resolution ? e.resolution : e.reason}</p>
                <p className="tabular mt-1 text-xs">Ours {h(e.ourHours)} h · Gate {h(e.theirHours)} h</p>
                {canResolve && e.status === "OPEN" && (
                  <Button variant="outline" className="mt-2 min-h-11 w-full" onClick={() => setTarget(e)} data-testid="gate-resolve">
                    Resolve
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <ResolveSheet key={target?.id ?? "none"} row={target} onClose={() => setTarget(null)} />
    </div>
  );
}
