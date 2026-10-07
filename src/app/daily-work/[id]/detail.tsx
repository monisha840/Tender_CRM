"use client";

import { useState } from "react";
import { Camera, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { FieldGrid, ProgressBar, Section, textareaClass } from "@/components/work/parts";
import { getDailyReport } from "@/lib/data";
import { formatDate, formatDateTime, nowIso } from "@/lib/dates";
import { useCurrentPersona, useDb } from "@/store/hooks";
import { useDataStore } from "@/store/data-store";

export function Detail({ id }: { id: string }) {
  const db = useDb();
  const persona = useCurrentPersona();
  const upsert = useDataStore((s) => s.upsert);
  const data = getDailyReport(db, id);
  const [comment, setComment] = useState("");

  if (!data) {
    return (
      <div className="rounded-lg border bg-surface">
        <EmptyState message="This report does not exist." action={{ label: "Back to daily work", href: "/daily-work" }} />
      </div>
    );
  }
  const { report, site, items } = data;
  const project = db.projects.find((p) => p.id === report.projectId);
  const who = (uid?: string | null) => db.users.find((u) => u.id === uid)?.name ?? "—";

  const markReviewed = () => {
    upsert("dailyReports", {
      ...report,
      status: "REVIEWED",
      reviewedById: persona.user.id,
      reviewComment: comment.trim() || report.reviewComment || null,
      updatedAt: nowIso(),
    });
    toast.success("Report marked as reviewed");
  };

  return (
    <>
      <PageHeader
        title={`${project?.name ?? "Report"} · ${formatDate(report.reportDate)}`}
        status={<StatusBadge status={report.status} />}
        description={site.name}
        secondaryActions={[{ label: "All reports", href: "/daily-work" }]}
      />
      <div className="space-y-6">
        <div className="rounded-lg border bg-surface p-4">
          <FieldGrid
            fields={[
              { label: "Workers on site", value: report.workersCount },
              { label: "Photos", value: <span className="inline-flex items-center gap-1"><Camera className="size-4 text-muted-foreground" aria-hidden="true" />{report.photoCount}</span> },
              { label: "Submitted by", value: `${who(report.submittedById)}${report.submittedAt ? ` · ${formatDateTime(report.submittedAt)}` : ""}` },
              { label: "Issues", value: report.issues ?? "None reported" },
              { label: "Plan for tomorrow", value: report.planForTomorrow ?? "—" },
              { label: "Reviewed by", value: report.reviewedById ? `${who(report.reviewedById)}${report.reviewComment ? ` — ${report.reviewComment}` : ""}` : "Not reviewed yet" },
            ]}
          />
        </div>

        <Section title="Work done">
          {items.length === 0 ? (
            <div className="rounded-lg border bg-surface"><EmptyState message="No work items recorded." /></div>
          ) : (
            <ul className="divide-y rounded-lg border bg-surface">
              {items.map(({ item, boq, unit, progressPct }) => (
                <li key={item.id} className="space-y-1.5 px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">{boq.description}</span>
                    <span className="tabular shrink-0 text-muted-foreground">
                      {item.completedQty} / {item.plannedQty} {unit}
                    </span>
                  </div>
                  <ProgressBar value={progressPct} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {report.status === "SUBMITTED" && (
          <Section title="Review">
            <div className="space-y-3 rounded-lg border bg-surface p-4">
              <label htmlFor="comment" className="text-sm font-medium">
                Comment <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea id="comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className={textareaClass} placeholder="Feedback for the site team" />
              <Button className="min-h-11 w-full sm:w-auto" onClick={markReviewed}>
                <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
                Mark as reviewed
              </Button>
            </div>
          </Section>
        )}
      </div>
    </>
  );
}
