"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Ban, Hourglass, ThumbsDown, ThumbsUp, Trophy } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import type { TenderDetail } from "@/lib/data/tenders";
import {
  markTenderLostAction,
  markTenderWonAction,
  moveTenderStageAction,
  requestGoNoGoAction,
} from "@/modules/tenders/actions";
import { useDb } from "@/store/hooks";
import { errorText, useTenderRoles, type ClientActionResult } from "./action-helpers";
import { ReasonDialog } from "./reason-dialog";

type Dialog = null | "go" | "nogo" | "won" | "lost" | "back";

/**
 * The next step for a tender, as buttons: move along the stages, request GO / NO-GO, record the result.
 * Buttons hide by role for clarity only; every action is checked again on the server.
 */
export function TenderActions({ detail }: { detail: TenderDetail }) {
  const db = useDb();
  const router = useRouter();
  const { canWrite, canDecide } = useTenderRoles();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  const t = detail.tender;
  const version = t.version ?? 1;
  const key = detail.stage.systemKey;
  const open = db.tenderStages.filter((s) => s.isActive && s.kind === "OPEN").sort((a, b) => a.sequence - b.sequence);
  const idx = open.findIndex((s) => s.id === detail.stage.id);
  const next = idx >= 0 ? open[idx + 1] : undefined;
  const prev = idx > 0 ? open[idx - 1] : undefined;
  const pending = db.approvalRequests.find((r) => r.entityType === "TENDER_GO_NO_GO" && r.entityId === t.id && r.status === "PENDING" && !r.deletedAt);
  const hasGo = detail.decisions.some((d) => d.decision === "GO");

  async function run(promise: Promise<ClientActionResult>, success: string): Promise<string | void> {
    const res = await promise;
    if (!res.ok) return errorText(res);
    toast.success(success);
    router.refresh();
  }

  async function advance() {
    if (!next) return;
    setBusy(true);
    const msg = await run(moveTenderStageAction({ id: t.id, toStageId: next.id, version }), `Moved to ${next.name}`);
    setBusy(false);
    if (msg) toast.error(msg);
  }

  if (detail.stage.kind !== "OPEN") return null;

  const waiting = key === "UNDER_EVALUATION" && pending;
  const gate = key === "UNDER_EVALUATION" && !pending && !hasGo;
  // From Under Evaluation the only way forward is an approved GO (done by the approval itself).
  const canAdvance = !!next && key !== "UNDER_EVALUATION" && key !== "SUBMITTED";

  return (
    <div className="mb-4 rounded-lg border bg-surface p-4" data-testid="tender-actions">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="font-medium">Next step</p>
          <p className="text-muted-foreground">
            {key === "NEW" && "Review the notice, then move the tender to Under Evaluation for the GO / NO-GO decision."}
            {gate && "Request the GO / NO-GO decision. The Director approves it."}
            {waiting && "Waiting for the Director to decide GO / NO-GO."}
            {key === "UNDER_EVALUATION" && !pending && hasGo && "GO approved. The tender continues to Bid Preparing."}
            {key === "BID_PREPARING" && "Prepare the documents and the bid, then mark the tender as submitted."}
            {key === "SUBMITTED" && "Record the result once it is announced."}
          </p>
          {waiting && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status="PENDING" label="With the Director" />
              {canDecide && (
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/approvals" />} data-testid="go-nogo-review">
                  <Hourglass data-icon="inline-start" aria-hidden="true" />
                  Review in Approvals
                </Button>
              )}
            </div>
          )}
        </div>

        {canWrite && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {gate && (
              <>
                <Button className="min-h-11 md:min-h-8" onClick={() => setDialog("go")} data-testid="go-nogo-request">
                  <ThumbsUp data-icon="inline-start" aria-hidden="true" />
                  Request GO
                </Button>
                <Button variant="outline" className="min-h-11 md:min-h-8" onClick={() => setDialog("nogo")} data-testid="no-go-request">
                  <ThumbsDown data-icon="inline-start" aria-hidden="true" />
                  Request NO-GO
                </Button>
              </>
            )}
            {canAdvance && next && (
              <Button className="min-h-11 md:min-h-8" disabled={busy} onClick={advance} data-testid="stage-advance">
                <ArrowRight data-icon="inline-start" aria-hidden="true" />
                {key === "NEW" ? `Move to ${next.name}` : key === "BID_PREPARING" ? "Mark as submitted" : `Move to ${next.name}`}
              </Button>
            )}
            {key === "SUBMITTED" && (
              <>
                <Button className="min-h-11 md:min-h-8" onClick={() => setDialog("won")} data-testid="mark-won">
                  <Trophy data-icon="inline-start" aria-hidden="true" />
                  Mark won
                </Button>
                <Button variant="outline" className="min-h-11 md:min-h-8" onClick={() => setDialog("lost")} data-testid="mark-lost">
                  <Ban data-icon="inline-start" aria-hidden="true" />
                  Mark lost
                </Button>
              </>
            )}
            {prev && key !== "SUBMITTED" && !waiting && (
              <Button variant="ghost" className="min-h-11 md:min-h-8" onClick={() => setDialog("back")} data-testid="stage-back">
                <ArrowLeft data-icon="inline-start" aria-hidden="true" />
                Back to {prev.name}
              </Button>
            )}
          </div>
        )}
      </div>

      <ReasonDialog
        testId="go-request"
        open={dialog === "go"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Request GO"
        description={`Ask the Director to approve bidding for ${t.tenderNo}.`}
        label="Note for the Director"
        required={false}
        placeholder="e.g. Eligibility met; manpower available in the region"
        confirmLabel="Send for approval"
        onConfirm={(reason) => run(requestGoNoGoAction({ id: t.id, recommendation: "GO", reason: reason || undefined }), "GO request sent to the Director")}
      />
      <ReasonDialog
        testId="nogo-request"
        open={dialog === "nogo"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Request NO-GO"
        description={`Ask the Director to approve not bidding for ${t.tenderNo}. The tender is closed if approved.`}
        placeholder="Why should the company not bid?"
        confirmLabel="Send for approval"
        onConfirm={(reason) => run(requestGoNoGoAction({ id: t.id, recommendation: "NO_GO", reason }), "NO-GO request sent to the Director")}
      />
      <ReasonDialog
        testId="won"
        open={dialog === "won"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Mark tender won"
        description="Recorded in the audit trail with your reason."
        placeholder="e.g. L1, Letter of Acceptance received"
        confirmLabel="Mark won"
        onConfirm={(reason) => run(markTenderWonAction({ id: t.id, version, reason }), "Tender marked won")}
      />
      <ReasonDialog
        testId="lost"
        open={dialog === "lost"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Mark tender lost"
        description="Recorded in the audit trail with your reason."
        placeholder="e.g. Not L1, lost to a competitor"
        confirmLabel="Mark lost"
        onConfirm={(reason) => run(markTenderLostAction({ id: t.id, version, reason }), "Tender marked lost")}
      />
      <ReasonDialog
        testId="back"
        open={dialog === "back"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={prev ? `Move back to ${prev.name}` : "Move back"}
        placeholder="Why is the tender moving back?"
        confirmLabel="Move back"
        onConfirm={(reason) => (prev ? run(moveTenderStageAction({ id: t.id, toStageId: prev.id, version, reason }), `Moved back to ${prev.name}`) : Promise.resolve())}
      />
    </div>
  );
}

