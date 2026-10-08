"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Section } from "@/components/tenders/parts";
import { formatDate } from "@/lib/dates";
import { getTenderDocumentIssuesAction } from "@/modules/documents/actions";
import { blockingIssues, type DocIssue } from "@/modules/documents/status";

const KIND_TEXT: Record<DocIssue["kind"], string> = {
  MISSING: "Not in the vault",
  EXPIRED: "Expired",
  EXPIRES_BEFORE_SUBMISSION: "Expires before submission",
};

/**
 * Tender detail panel: mandatory documents that are missing from the vault or expire before the submission
 * deadline. Expired ones also block moving the tender to Submitted (enforced on the server).
 * Renders nothing when the user cannot view the vault.
 */
export function TenderDocumentsPanel({ tenderId, refreshKey }: { tenderId: string; refreshKey?: unknown }) {
  const [state, setState] = useState<{ issues: DocIssue[]; submissionDate: string } | "hidden" | null>(null);

  useEffect(() => {
    let live = true;
    getTenderDocumentIssuesAction({ tenderId }).then((res) => {
      if (live) setState(res.ok ? res.data : "hidden");
    });
    return () => {
      live = false;
    };
  }, [tenderId, refreshKey]);

  if (state === "hidden" || state === null) return null;
  const { issues, submissionDate } = state;
  const blocking = blockingIssues(issues).length;

  return (
    <Section
      title="Company documents"
      hint={`Mandatory documents checked against the vault for submission on ${formatDate(submissionDate)}`}
      action={
        <Link href="/documents" className="text-sm text-accent-strong hover:underline">
          Open vault
        </Link>
      }
    >
      <div data-testid="tender-docs-panel">
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 text-sm" data-testid="tender-docs-ok">
            <CheckCircle2 className="size-4 text-status-success" aria-hidden="true" />
            All mandatory documents are valid through the submission date.
          </p>
        ) : (
          <>
            {blocking > 0 && (
              <p role="alert" className="mb-3 rounded-md bg-status-danger/10 px-3 py-2 text-sm text-status-danger" data-testid="tender-docs-blocked">
                {blocking} expired {blocking === 1 ? "document blocks" : "documents block"} marking this tender as Submitted. Renew in the vault first.
              </p>
            )}
            <ul className="divide-y text-sm">
              {issues.map((i) => (
                <li key={i.documentTypeId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2" data-testid="tender-docs-issue">
                  <span className="flex items-center gap-2 font-medium">
                    <AlertTriangle className={i.kind === "MISSING" ? "size-4 text-status-warning" : "size-4 text-status-danger"} aria-hidden="true" />
                    {i.name}
                  </span>
                  <span className="text-muted-foreground">
                    {KIND_TEXT[i.kind]}
                    {i.expiryDate ? ` (${formatDate(i.expiryDate)})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Section>
  );
}
