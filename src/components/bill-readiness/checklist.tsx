"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, Lock } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { errorText } from "@/components/tenders/action-helpers";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatMonth } from "@/lib/dates";
import { setBillReadinessCheckAction } from "@/modules/bill-readiness/actions";
import type { ChecklistRow } from "@/modules/bill-readiness/queries";
import type { ReadinessResult } from "@/modules/bill-readiness/readiness";
import { MonthPicker } from "./month-picker";
import { ReadinessBadge } from "./overview";

function Item({ row, projectId, month, canUpdate }: { row: ChecklistRow; projectId: string; month: string; canUpdate: boolean }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [doneOn, setDoneOn] = useState(row.doneOn ?? today);
  const [reference, setReference] = useState(row.reference ?? "");
  const [busy, setBusy] = useState(false);

  async function save(isDone: boolean) {
    if (!row.templateItemId || busy) return;
    setBusy(true);
    const res = await setBillReadinessCheckAction({ projectId, periodMonth: month, templateItemId: row.templateItemId, isDone, doneOn: isDone ? doneOn : "", reference });
    setBusy(false);
    if (!res.ok) return void toast.error(errorText(res));
    toast.success(isDone ? `${row.label} marked done` : `${row.label} reopened`);
    router.refresh();
  }

  const Icon = row.isDone ? CheckCircle2 : row.derived ? Lock : Circle;
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`br-item-${row.code}`} data-done={row.isDone}>
      <div className="flex min-w-0 items-start gap-3">
        <Icon className={row.isDone ? "mt-0.5 size-5 shrink-0 text-status-success" : "mt-0.5 size-5 shrink-0 text-muted-foreground"} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {row.label} {!row.isMandatory && <span className="font-normal text-muted-foreground">(optional)</span>}
          </p>
          {row.derived ? (
            <p className="text-xs text-muted-foreground">Worked out from the gate attendance upload and its exceptions. {row.isDone ? "Reconciled." : "Upload the month and resolve open exceptions."}</p>
          ) : row.isDone ? (
            <p className="text-xs text-muted-foreground">
              Done {row.doneOn ? formatDate(row.doneOn) : ""}
              {row.reference ? ` · Ref ${row.reference}` : ""}
            </p>
          ) : null}
        </div>
      </div>
      {row.derived ? (
        <StatusBadge tone={row.isDone ? "success" : "warning"} label={row.isDone ? "Reconciled" : "Not reconciled"} />
      ) : canUpdate ? (
        row.isDone ? (
          <Button variant="outline" className="min-h-11 sm:min-h-8" disabled={busy} onClick={() => save(false)} data-testid={`br-reopen-${row.code}`}>
            Reopen
          </Button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input type="date" value={doneOn} onChange={(e) => setDoneOn(e.target.value)} aria-label={`${row.label} date`} className="sm:w-40" data-testid={`br-date-${row.code}`} />
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference" aria-label={`${row.label} reference`} className="sm:w-40" data-testid={`br-ref-${row.code}`} />
            <Button className="min-h-11 sm:min-h-8" disabled={busy || !doneOn} onClick={() => save(true)} data-testid={`br-done-${row.code}`}>
              Mark done
            </Button>
          </div>
        )
      ) : (
        <StatusBadge tone={row.isDone ? "success" : "warning"} label={row.isDone ? "Done" : "Pending"} />
      )}
    </li>
  );
}

export function BillReadinessChecklist({
  project, rows, status, month, canUpdate,
}: {
  project: { id: string; code: string; name: string };
  rows: ChecklistRow[];
  status: ReadinessResult;
  month: string;
  canUpdate: boolean;
}) {
  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href={`/bill-readiness?month=${month}`} />}>
        <ArrowLeft data-icon="inline-start" aria-hidden="true" />
        All projects
      </Button>
      <PageHeader
        title={`${project.code} · ${project.name}`}
        status={<ReadinessBadge ready={status.ready} label={status.label} />}
        description={`Bill readiness for ${formatMonth(month)}: ${status.done} of ${status.total} items done.`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <MonthPicker basePath={`/bill-readiness/${project.id}`} month={month} />
      </div>
      <p className="mb-3 text-sm" data-testid="br-status-text" role="status">
        {status.label}
      </p>
      {rows.length === 0 ? (
        <p className="rounded-lg border bg-surface p-4 text-sm text-muted-foreground">No checklist items are set up yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-surface" aria-label="Checklist items">
          {rows.map((r) => (
            <Item key={`${r.code}-${r.isDone}-${r.doneOn}`} row={r} projectId={project.id} month={month} canUpdate={canUpdate} />
          ))}
        </ul>
      )}
    </>
  );
}
