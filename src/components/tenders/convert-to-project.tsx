"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRightCircle, FolderKanban, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildConversion, checkConversion, type TenderDetail } from "@/lib/data/tenders";
import { can } from "@/lib/data/access";
import { formatINR } from "@/lib/money";
import { useDataStore } from "@/store/data-store";
import { useCurrentPersona, useDb } from "@/store/hooks";

/**
 * Won tender -> project. Carries organisation, region, GSTIN, value, dates and the PBG across,
 * then links to the new project. Open mandatory award conditions need a written reason.
 */
export function ConvertToProject({ detail }: { detail: TenderDetail }) {
  const db = useDb();
  const persona = useCurrentPersona();
  const upsert = useDataStore((s) => s.upsert);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  const projectHref = (id: string) => `/projects?focus=${encodeURIComponent(id)}`;
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
  if (!can(db, persona.user.id, "tenders", "APPROVE") && !can(db, persona.user.id, "tenders", "EDIT")) {
    return <p className="text-sm text-muted-foreground">Your role ({persona.role.name}) cannot convert tenders to projects.</p>;
  }

  const needsReason = check.unmetConditions.length > 0;
  const value = detail.award?.awardedAmount ?? detail.bid?.quotedAmount ?? detail.tender.estimatedValue;

  const convert = () => {
    const { project, conversion, instruments } = buildConversion(db, detail, persona.user.id, needsReason ? reason.trim() : null);
    upsert("projects", project);
    upsert("projectConversions", conversion);
    instruments.forEach((i) => upsert("securityInstruments", i));
    toast.success(`Project ${project.code} created`, {
      description: "Client, region, GSTIN, value and dates were carried over.",
      action: { label: "Open project", onClick: () => window.location.assign(projectHref(project.id)) },
    });
    setConfirming(false);
  };

  if (!confirming) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Won at {formatINR(value, { compact: true })}. Create the project now and carry the tender&apos;s data across.
        </p>
        <Button onClick={() => setConfirming(true)}>
          <ArrowRightCircle data-icon="inline-start" aria-hidden="true" />
          Convert to project
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        The project will be created for <span className="font-medium">{detail.organisationName}</span> in {detail.regionName} with a contract value of{" "}
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
          <Input id="convert-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. PBG will be submitted this week" className="mt-1 bg-surface" />
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Button onClick={convert} disabled={needsReason && reason.trim().length < 5}>
          Create project
        </Button>
      </div>
    </div>
  );
}
