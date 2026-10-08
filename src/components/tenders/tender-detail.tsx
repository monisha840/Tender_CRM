"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, ExternalLink, FileWarning, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DeadlineBadge, StageBadge, StatusBadge } from "@/components/shared/status-badge";
import { Timeline, type TimelineEntry } from "@/components/shared/timeline";
import { Button } from "@/components/ui/button";
import { getTender, missingMandatoryDocs, type TenderDetail as Detail } from "@/lib/data/tenders";
import { byId, employeeName, userName } from "@/lib/data/shared";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useDb } from "@/store/hooks";
import { deleteTenderAction } from "@/modules/tenders/actions";
import { errorText, useTenderRoles } from "./action-helpers";
import { ConvertToProject } from "./convert-to-project";
import { ReasonDialog } from "./reason-dialog";
import { TenderActions } from "./tender-actions";
import { TenderDocumentsPanel } from "@/components/documents/tender-documents-panel";
import { PricingPanel } from "@/components/bid-pricing/pricing-panel";
import { EditTenderForm } from "./tender-entry";
import { Field, FieldGrid, Section } from "./parts";

const MODE_LABEL: Record<string, string> = { DD: "Demand draft", BG: "Bank guarantee", ONLINE: "Online", FDR: "Fixed deposit", EXEMPTION: "Exempt" };
const TYPE_LABEL: Record<string, string> = { EMD: "EMD", PBG: "PBG", ADDITIONAL_PBG: "Additional PBG", SECURITY_DEPOSIT: "Security deposit" };

export function TenderDetail({ id }: { id: string }) {
  const db = useDb();
  const d = useMemo(() => getTender(db, id), [db, id]);
  const router = useRouter();
  const { canWrite } = useTenderRoles();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!d) {
    return (
      <div className="rounded-lg border bg-surface">
        <EmptyState message="This tender was not found. It may have been removed." action={{ label: "Back to tenders", href: "/tenders" }} />
      </div>
    );
  }

  const t = d.tender;
  const site = byId(db.sites, t.siteId);
  const portal = byId(db.tenderPortals, t.portalId);
  const type = byId(db.tenderTypes, t.tenderTypeId);
  const gst = byId(db.gstRegistrations, t.gstRegistrationId);
  const isOpen = d.stage.kind === "OPEN";
  const awaitingBid = isOpen && d.stage.systemKey !== "SUBMITTED";
  const missing = missingMandatoryDocs(d.documents);

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href="/tenders" />}>
        <ArrowLeft data-icon="inline-start" aria-hidden="true" />
        All tenders
      </Button>

      <PageHeader
        title={t.title}
        status={<StageBadge name={d.stage.name} kind={d.stage.kind} color={d.stage.color} />}
        description={`${t.tenderNo} · ${d.organisationName} · ${d.regionName}`}
        primaryAction={canWrite && !d.projectId ? { label: "Edit tender", icon: Pencil, onClick: () => setEditing(true), testId: "tender-edit" } : undefined}
        secondaryActions={canWrite && !d.projectId ? [{ label: "Delete tender", icon: Trash2, onClick: () => setDeleting(true), testId: "tender-delete" }] : undefined}
      />
      {editing && <EditTenderForm tender={t} onOpenChange={setEditing} />}
      <ReasonDialog
        testId="tender-delete-dialog"
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete tender"
        description={`${t.tenderNo} is hidden from every list. The record and its history stay in the audit trail.`}
        placeholder="Why is this tender being deleted?"
        confirmLabel="Delete tender"
        onConfirm={async (reason) => {
          const res = await deleteTenderAction({ id: t.id, version: t.version ?? 1, reason });
          if (!res.ok) return errorText(res);
          toast.success(`Tender ${t.tenderNo} deleted`);
          router.push("/tenders");
          router.refresh();
        }}
      />

      <TenderActions detail={d} />
      <PricingPanel tenderId={t.id} compact />

      {d.stage.kind === "WON" && (
        <div className="mb-4 rounded-lg border bg-surface p-4">
          <ConvertToProject detail={d} />
        </div>
      )}

      <Section title="Progress" hint="Where this tender is, and what happened so far" className="mb-4">
        <StageStepper detail={d} stages={db.tenderStages} />
        <div className="mt-5 border-t pt-4">
          <Timeline entries={timelineEntries(d)} />
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Section title="Tender details">
            <FieldGrid>
              <Field label="Tender ID">{t.tenderNo}</Field>
              <Field label="Organisation">{d.organisationName}</Field>
              <Field label="Service line">{d.serviceLineName}</Field>
              <Field label="Region">{d.regionName}</Field>
              <Field label="Location">{t.location}</Field>
              <Field label="Plant site">{site?.name}</Field>
              <Field label="Tender type">{type?.name}</Field>
              <Field label="Portal">
                {portal?.name}
                {t.sourceUrl && (
                  <a href={t.sourceUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-accent-strong hover:underline">
                    Open <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                )}
              </Field>
              <Field label="Owner">{d.ownerName}</Field>
              <Field label="Bidding GSTIN">{gst ? `${gst.gstin} (${gst.tradeName ?? gst.legalName})` : null}</Field>
              <Field label="Estimated value" numeric>
                {formatINR(t.estimatedValue)}
              </Field>
              <Field label="Published on" numeric>
                {formatDate(t.publishedOn)}
              </Field>
              <Field label="Pre-bid meeting" numeric>
                {formatDateTime(t.preBidAt)}
              </Field>
              <Field label="Submission deadline">
                <span className="tabular">{formatDateTime(t.submissionDeadlineAt)}</span>
                {awaitingBid && (
                  <span className="ml-2 align-middle">
                    <DeadlineBadge value={t.submissionDeadlineAt} />
                  </span>
                )}
              </Field>
              <Field label="Bid opening date" numeric>
                {formatDate(t.openingDate)}
              </Field>
              <Field label="Technical opening" numeric>
                {formatDateTime(t.technicalOpeningAt)}
              </Field>
              <Field label="Financial opening" numeric>
                {formatDateTime(t.financialOpeningAt)}
              </Field>
              <Field label="Work description" wide>
                {t.workDescription}
              </Field>
            </FieldGrid>
          </Section>

          <Section title="Eligibility" hint="Qualification criteria in the tender notice">
            <p className="text-sm">{t.eligibility}</p>
          </Section>

          <DocumentChecklist detail={d} missingCount={missing.length} />
          {awaitingBid && <TenderDocumentsPanel tenderId={t.id} refreshKey={d.stage.id} />}
          <BidSection detail={d} />
        </div>

        <div className="min-w-0 space-y-4">
          <Section title="EMD and tender fee">
            <dl className="grid grid-cols-2 gap-3">
              <Field label="EMD amount" numeric>
                {formatINR(t.emdAmount)}
              </Field>
              <Field label="Tender fee" numeric>
                {formatINR(t.tenderFee)}
              </Field>
            </dl>
            {d.instruments.length === 0 ? (
              <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">EMD has not been arranged yet. Accounts arranges it once the tender is approved.</p>
            ) : (
              <ul className="mt-4 divide-y border-t">
                {d.instruments.map((s) => (
                  <li key={s.id} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">
                        {TYPE_LABEL[s.type] ?? s.type} · <span className="tabular">{formatINR(s.amount)}</span>
                      </p>
                      <StatusBadge status={s.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {MODE_LABEL[s.mode] ?? s.mode}
                      {s.instrumentNo ? ` · ${s.instrumentNo}` : ""}
                      {s.bank ? ` · ${s.bank}` : ""}
                    </p>
                    <p className="tabular text-xs text-muted-foreground">
                      Issued {formatDate(s.issueDate)} · Expires {formatDate(s.expiryDate)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {d.decisions.length > 0 && (
            <Section title="GO / NO-GO">
              {d.decisions.map((g) => (
                <div key={g.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={g.decision === "GO" ? "APPROVED" : "NO_GO"} label={g.decision === "GO" ? "GO" : "NO-GO"} />
                    <span className="tabular text-xs text-muted-foreground">{formatDateTime(g.decidedAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Decided by {userName(db, g.decidedById)}</p>
                  {g.reason && <p className="text-sm">{g.reason}</p>}
                </div>
              ))}
            </Section>
          )}
          {d.decisions.length === 0 && d.stage.systemKey === "UNDER_EVALUATION" && (
            <Section title="GO / NO-GO">
              <StatusBadge status="PENDING" label="Decision pending" />
              <p className="mt-2 text-sm text-muted-foreground">Waiting for the Director or Regional Head. Check Approvals.</p>
            </Section>
          )}

          {d.award && <AwardSection detail={d} />}
        </div>
      </div>
    </>
  );
}


function timelineEntries(d: Detail): TimelineEntry[] {
  return d.history.map((h, i) => ({
    id: `${i}`,
    title: h.toStage,
    time: formatDateTime(h.at),
    by: h.by,
    description: h.reason ?? undefined,
    tone: h.toStage === "Won" ? "success" : h.toStage === "Lost" ? "danger" : "accent",
  }));
}

/** New → Under Evaluation → Bid Preparing → Submitted → Won/Lost, with the current step marked. */
function StageStepper({ detail, stages }: { detail: Detail; stages: ReturnType<typeof useDb>["tenderStages"] }) {
  const open = stages.filter((s) => s.isActive && s.kind === "OPEN").sort((a, b) => a.sequence - b.sequence);
  const finished = detail.stage.kind === "WON" || detail.stage.kind === "LOST";
  const result = { id: "result", name: finished ? detail.stage.name : "Won / Lost", kind: detail.stage.kind };
  const steps = [...open.map((s) => ({ id: s.id, name: s.name, kind: s.kind })), result];
  const current = finished ? steps.length - 1 : open.findIndex((s) => s.id === detail.stage.id);

  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Tender stages">
      {steps.map((s, i) => {
        const done = i < current || (finished && i === current);
        const isCurrent = i === current;
        const lost = finished && i === current && detail.stage.kind === "LOST";
        return (
          <li key={s.id} className="relative flex flex-col items-center text-center" aria-current={isCurrent ? "step" : undefined}>
            {i > 0 && <span aria-hidden="true" className={cn("absolute top-3.5 right-1/2 h-px w-full", i <= current ? "bg-accent-strong" : "bg-border")} />}
            <span
              className={cn(
                "relative flex size-7 items-center justify-center rounded-full border text-xs font-medium",
                lost
                  ? "border-status-danger bg-status-danger-tint text-status-danger"
                  : done
                    ? "border-accent-strong bg-accent text-accent-foreground"
                    : isCurrent
                      ? "border-accent-strong bg-surface text-accent-strong ring-3 ring-accent/40"
                      : "bg-surface text-muted-foreground",
              )}
            >
              {lost ? <X className="size-3.5" aria-hidden="true" /> : done ? <Check className="size-3.5" aria-hidden="true" /> : i + 1}
            </span>
            <span className={cn("mt-1.5 text-[11px] leading-tight sm:text-xs", isCurrent ? "font-semibold" : "text-muted-foreground")}>{s.name}</span>
          </li>
        );
      })}
    </ol>
  );
}

function DocumentChecklist({ detail: d, missingCount }: { detail: Detail; missingCount: number }) {
  const db = useDb();
  const applicable = d.documents.filter((x) => x.status !== "NA");
  const ready = applicable.filter((x) => x.status === "READY").length;
  const pct = applicable.length ? Math.round((ready / applicable.length) * 100) : 0;

  return (
    <Section
      title="Document checklist"
      hint={d.documents.length ? `${ready} of ${applicable.length} ready` : undefined}
      action={
        missingCount > 0 && d.stage.kind === "OPEN" ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-status-warning">
            <FileWarning className="size-3.5" aria-hidden="true" />
            {missingCount} mandatory pending
          </span>
        ) : undefined
      }
    >
      {d.documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">The checklist is created when the tender moves to Bid Preparing.</p>
      ) : (
        <>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Documents ready">
            <div className="h-full bg-accent-strong" style={{ width: `${pct}%` }} />
          </div>
          <ul className="divide-y">
            {d.documents.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm">
                    {x.name}
                    {x.isMandatory && <span className="ml-1.5 text-xs text-muted-foreground">Mandatory</span>}
                  </p>
                  <p className="tabular text-xs text-muted-foreground">
                    {employeeName(db, x.assigneeId)} · due {formatDate(x.dueDate)}
                  </p>
                </div>
                <StatusBadge status={x.status} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

function BidSection({ detail: d }: { detail: Detail }) {
  const bid = d.bid;
  const pct = bid ? Number(bid.percentVsEstimate) : 0;
  return (
    <Section title="Bid and evaluation">
      {!bid ? (
        <p className="text-sm text-muted-foreground">No bid yet. The quoted amount is recorded when the bid is prepared and submitted.</p>
      ) : (
        <div className="space-y-4">
          <FieldGrid>
            <Field label="Quoted amount" numeric>
              {formatINR(bid.quotedAmount)}
            </Field>
            <Field label="Against estimate" numeric>
              {pct === 0 ? "At estimate" : `${Math.abs(pct).toFixed(2)}% ${pct < 0 ? "below" : "above"}`}
            </Field>
            <Field label="Submitted" numeric>
              {formatDateTime(bid.submittedAt)}
            </Field>
            <Field label="Technical result">
              <StatusBadge status={bid.technicalResult === "PENDING" ? "PENDING" : bid.technicalResult} />
            </Field>
            <Field label="Financial rank">{bid.financialRank ? `${bid.isL1 ? "L1 · " : ""}Rank ${bid.financialRank}` : "Not yet known"}</Field>
          </FieldGrid>

          {d.competitors.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Competitor bids</h3>
              <ul className="divide-y rounded-lg border">
                {d.competitors.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="text-muted-foreground">#{c.rank} </span>
                      {c.competitorName}
                      {c.isL1 && <span className="ml-1.5 text-xs font-medium text-accent-strong">L1</span>}
                    </span>
                    <span className="tabular shrink-0">{formatINR(c.amount, { compact: true })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {d.clarifications.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Clarifications</h3>
              <ul className="space-y-2">
                {d.clarifications.map((c) => (
                  <li key={c.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p>{c.request}</p>
                      <StatusBadge status={c.response ? "RESOLVED" : "PENDING"} label={c.response ? "Answered" : "Reply due"} />
                    </div>
                    <p className="tabular mt-1 text-xs text-muted-foreground">
                      Asked {formatDate(c.requestedOn)} · due {formatDate(c.dueDate)}
                    </p>
                    {c.response && <p className="mt-1 text-muted-foreground">{c.response}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function AwardSection({ detail: d }: { detail: Detail }) {
  const a = d.award!;
  return (
    <Section title="Award">
      <dl className="grid grid-cols-2 gap-3">
        <Field label="LoA number">{a.loaNo}</Field>
        <Field label="LoA date" numeric>
          {formatDate(a.loaDate)}
        </Field>
        <Field label="Awarded amount" numeric>
          {formatINR(a.awardedAmount)}
        </Field>
        <Field label="Completion period">{a.completionPeriodDays ? `${a.completionPeriodDays} days` : null}</Field>
        <Field label="Agreement no.">{a.agreementNo}</Field>
        <Field label="Agreement date" numeric>
          {formatDate(a.agreementDate)}
        </Field>
      </dl>
      {a.conditionsNote && <p className="mt-3 text-sm text-muted-foreground">{a.conditionsNote}</p>}
      {d.conditions.length > 0 && (
        <ul className="mt-3 divide-y border-t">
          {d.conditions.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2 py-2.5">
              <div className="min-w-0 text-sm">
                {c.description}
                <p className="tabular text-xs text-muted-foreground">
                  {c.isMandatory ? "Mandatory" : "Optional"} · due {formatDate(c.dueDate)}
                </p>
              </div>
              <StatusBadge status={c.status} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
