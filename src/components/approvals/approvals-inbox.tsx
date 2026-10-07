"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, ExternalLink, Inbox, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DeadlineBadge, StatusBadge } from "@/components/shared/status-badge";
import { Timeline } from "@/components/shared/timeline";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getApprovalTimeline, getScope, listApprovals, type ApprovalRow } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/store/data-store";
import { useCurrentPersona, useDb, useRegionFilter } from "@/store/hooks";

type Tab = "mine" | "all" | "decided";

/** Approvals inbox: what waits for me, everything pending, and the decided history. Approve or reject with a comment. */
export function ApprovalsInbox() {
  const db = useDb();
  const persona = useCurrentPersona();
  const { region } = useRegionFilter();
  const upsert = useDataStore((s) => s.upsert);
  const [tab, setTab] = useState<Tab>("mine");
  const [open, setOpen] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<{ row: ApprovalRow; decision: "APPROVE" | "REJECT" } | null>(null);
  const [comment, setComment] = useState("");

  const userId = persona.user.id;
  const canApproveAll = getScope(db, userId, "approvals", "APPROVE") === "ALL";
  const canApprove = getScope(db, userId, "approvals", "APPROVE") !== null;

  const all = useMemo(() => listApprovals(db, { region }), [db, region]);
  const pending = all.filter((r) => r.request.status === "PENDING");
  const lists: Record<Tab, ApprovalRow[]> = {
    mine: pending.filter((r) => r.assignedToId === userId),
    all: pending,
    decided: all.filter((r) => r.request.status !== "PENDING"),
  };
  const rows = lists[tab];
  const mayDecide = (r: ApprovalRow) => r.request.status === "PENDING" && canApprove && (r.assignedToId === userId || canApproveAll);

  function submit() {
    if (!deciding) return;
    const { row, decision } = deciding;
    if (decision === "REJECT" && !comment.trim()) return;
    const step = db.approvalSteps.find((s) => s.requestId === row.request.id && s.sequence === row.request.currentSequence);
    if (!step) return;
    const now = new Date().toISOString();
    const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    upsert("approvalSteps", { ...step, status, updatedAt: now });
    upsert("approvalRequests", { ...row.request, status, completedAt: now, updatedAt: now });
    upsert("approvalActions", { id: `aa_${step.id}_${Date.now()}`, createdAt: now, updatedAt: now, stepId: step.id, actorId: userId, action: decision, comment: comment.trim() || null, at: now });
    toast.success(decision === "APPROVE" ? "Approved" : "Rejected", { description: row.request.title });
    setDeciding(null);
    setComment("");
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "mine", label: "Waiting for me" },
    { key: "all", label: "All pending" },
    { key: "decided", label: "Decided" },
  ];

  return (
    <>
      <PageHeader title="Approvals" description="Everything waiting for a decision, in one place. Approve or reject with a comment." />
      <div role="tablist" aria-label="Approval views" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn("-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium md:min-h-9", tab === t.key ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
            <span className="tabular rounded-md bg-muted px-1.5 text-xs">{lists[t.key].length}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-surface">
          <EmptyState icon={Inbox} message={tab === "mine" ? "Nothing is waiting on you. New requests will appear here." : "No approvals in this view."} action={tab === "mine" ? { label: "See all pending", onClick: () => setTab("all") } : undefined} />
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const expanded = open === r.request.id;
            return (
              <li key={r.request.id} className="rounded-lg border bg-surface">
                <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={r.request.status} />
                      <span className="text-xs text-muted-foreground">{r.typeLabel} · {r.regionName}</span>
                      {r.request.status === "PENDING" && r.dueAt && <DeadlineBadge value={r.dueAt} />}
                    </div>
                    <p className="mt-1 text-sm font-medium">{r.request.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested by {r.requestedBy} on {formatDateTime(r.request.submittedAt)}
                      {r.request.amount ? ` · ${formatINR(r.request.amount, { compact: "auto" })}` : ""}
                      {r.request.status === "PENDING" ? ` · with ${r.assignedToName}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {mayDecide(r) && (
                      <>
                        <Button className="min-h-11 flex-1 md:min-h-8 md:flex-none" onClick={() => setDeciding({ row: r, decision: "APPROVE" })}>
                          <Check data-icon="inline-start" aria-hidden="true" /> Approve
                        </Button>
                        <Button variant="outline" className="min-h-11 flex-1 md:min-h-8 md:flex-none" onClick={() => setDeciding({ row: r, decision: "REJECT" })}>
                          <X data-icon="inline-start" aria-hidden="true" /> Reject
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" className="min-h-11 md:min-h-8" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r.request.id)}>
                      History {expanded ? <ChevronUp data-icon="inline-end" aria-hidden="true" /> : <ChevronDown data-icon="inline-end" aria-hidden="true" />}
                    </Button>
                  </div>
                </div>
                {expanded && (
                  <div className="border-t px-4 py-4">
                    <Timeline
                      entries={getApprovalTimeline(db, r.request.id).map((e, i) => ({
                        id: String(i),
                        title: e.label,
                        by: e.by,
                        time: formatDateTime(e.at),
                        tone: e.label === "Rejected" ? "danger" : e.label === "Approved" ? "success" : "accent",
                        description: e.comment ?? undefined,
                      }))}
                    />
                    <Link href={r.href} className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent-strong hover:underline md:min-h-0">
                      Open the record <ExternalLink className="size-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={deciding !== null} onOpenChange={(o) => !o && setDeciding(null)}>
        <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-xl p-4 sm:max-w-lg">
          <SheetHeader className="p-0">
            <SheetTitle>{deciding?.decision === "APPROVE" ? "Approve request" : "Reject request"}</SheetTitle>
            <SheetDescription>{deciding?.row.request.title}</SheetDescription>
          </SheetHeader>
          <label className="block text-sm font-medium" htmlFor="decision-comment">
            Comment {deciding?.decision === "REJECT" ? <span className="text-status-danger">(required)</span> : <span className="text-muted-foreground">(optional)</span>}
          </label>
          <textarea
            id="decision-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            className="w-full rounded-md border bg-surface p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
            placeholder={deciding?.decision === "REJECT" ? "Say why, so the requester can fix it" : "Add a note for the audit trail"}
          />
          <SheetFooter className="p-0">
            <Button className="min-h-11" disabled={deciding?.decision === "REJECT" && !comment.trim()} onClick={submit}>
              {deciding?.decision === "APPROVE" ? "Confirm approval" : "Confirm rejection"}
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
