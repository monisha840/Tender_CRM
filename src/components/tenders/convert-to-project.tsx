"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightCircle, FolderKanban, Hourglass, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkConversion, type TenderDetail } from "@/lib/data/tenders";
import { requestConversionAction } from "@/modules/tenders/actions";
import { entityHref } from "@/lib/data/links";
import { formatINR } from "@/lib/money";
import { useDb } from "@/store/hooks";
import { errorText, useTenderRoles } from "./action-helpers";
import { StatusBadge } from "@/components/shared/status-badge";

/**
 * Won tender -> project. Carries organisation, region, GSTIN, value, dates and the PBG across,
 * once the Director approves (the server runs the conversion). Open mandatory award conditions need a written reason.
 */
export function ConvertToProject({ detail }: { detail: TenderDetail }) {
  const db = useDb();
  const router = useRouter();
  const { canWrite, canDecide } = useTenderRoles();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  const projectHref = (id: string) => entityHref("PROJECT", id);
  if (detail.projectId) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">This tender has been converted to a project.</p>
        <Button variant="outline" nativeButton={false} render={<Link href={projectHref(detail.projectId)} />}>
          <FolderKanban data-icon="inline-start" aria-hidden="true" />
          Open project
        </Button>
      </div>
    );
  }

  const check = checkConversion(db, detail);
  if (detail.stage.kind !== "WON") return null;
  if (!check.ok) return <p className="text-sm text-muted-foreground">{check.blocker}</p>;
  const pending = db.approvalRequests.find((r) => r.entityType === "TENDER_CONVERSION" && r.entityId === detail.tender.id && r.status === "PENDING" && !r.deletedAt);
  if (pending) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-testid="conversion-pending">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status="PENDING" label="Conversion with the Director" />
          <p className="text-sm text-muted-foreground">The project is created as soon as the Director approves.</p>
        </div>
        {canDecide && (
          <Button variant="outline" nativeButton={false} render={<Link href="/approvals" />} data-testid="conversion-review">
            <Hourglass data-icon="inline-start" aria-hidden="true" />
            Review in Approvals
          </Button>
        )}
      </div>
    );
  }
  if (!canWrite) return <p className="text-sm text-muted-foreground">The System Admin requests the conversion; the Director approves it.</p>;

  const needsReason = check.unmetConditions.length > 0;
  const value = detail.award?.awardedAmount ?? detail.bid?.quotedAmount ?? detail.tender.estimatedValue;

  const convert = async () => {
    setBusy(true);
    setError(null);
    const res = await requestConversionAction({ id: detail.tender.id, overrideReason: needsReason ? reason.trim() : undefined });
    setBusy(false);
    if (!res.ok) {
      setError(errorText(res));
      return;
    }
    toast.success("Conversion sent to the Director", { description: "The project is created once it is approved." });
    setConfirming(false);
    router.refresh();
  };

  if (!confirming) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Won at {formatINR(value, { compact: true })}. Ask the Director to approve creating the project; the tender&apos;s data is carried across.
        </p>
        <Button onClick={() => setConfirming(true)} data-testid="convert">
          <ArrowRightCircle data-icon="inline-start" aria-hidden="true" />
          Convert to project
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Once the Director approves, the project is created for <span className="font-medium">{detail.organisationName}</span> in {detail.regionName} with a contract value of{" "}
        <span className="tabular font-medium">{formatINR(value)}</span>.
      </p>
      {needsReason && (
        <div className="rounded-lg border border-status-warning/40 bg-status-warning-tint p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-status-warning">
            <TriangleAlert className="size-4" aria-hidden="true" />
            Mandatory award conditions are still open
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {check.unmetConditions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <label className="mt-2 block text-xs text-muted-foreground" htmlFor="convert-reason">
            Reason for converting anyway (required, recorded with the conversion)
          </label>
          <Input id="convert-reason" data-testid="convert-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. PBG will be submitted this week" className="mt-1 bg-surface" />
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Button onClick={convert} disabled={busy || (needsReason && reason.trim().length < 5)} data-testid="convert-confirm">
          {busy ? "Sending…" : "Send for approval"}
        </Button>
      </div>
    </div>
  );
}
