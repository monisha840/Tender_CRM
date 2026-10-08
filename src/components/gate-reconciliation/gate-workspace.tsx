"use client";

import Link from "next/link";
import { useState } from "react";
import { ScanLine } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Section } from "@/components/tenders/parts";
import { formatMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { summaryText } from "@/modules/gate-reconciliation/match";
import type { MappingRow, ProjectOption, UploadSummaryRow } from "@/modules/gate-reconciliation/queries";
import { MappingsPanel } from "./mappings-panel";
import { UploadPanel } from "./upload-panel";

export function UploadState({ openExceptions }: { openExceptions: number }) {
  return openExceptions === 0 ? <StatusBadge status="GREEN" tone="success" label="Reconciled" /> : <StatusBadge status="AMBER" tone="warning" label={`${openExceptions} open`} />;
}

const TABS = [
  { key: "recon", label: "Reconciliation" },
  { key: "mappings", label: "Mappings" },
] as const;

export function GateWorkspace({
  projects, mappings, organisations, uploads, canCreate, canUpdate,
}: {
  projects: ProjectOption[];
  mappings: MappingRow[];
  organisations: { id: string; name: string }[];
  uploads: UploadSummaryRow[];
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("recon");
  return (
    <div data-testid="gate-workspace">
      <div role="tablist" aria-label="Gate attendance" className="mb-4 flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            data-testid={`gate-tab-${t.key}`}
            onClick={() => setTab(t.key)}
            className={cn("min-h-11 border-b-2 px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === t.key ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "recon" ? (
        <>
          <UploadPanel projects={projects} mappings={mappings} canCreate={canCreate} />
          <Section title="Reconciliations" hint="Latest upload for each project and month">
            {uploads.length === 0 ? (
              <EmptyState icon={ScanLine} message="Upload the client's gate attendance file to compare it with ours." />
            ) : (
              <ul className="divide-y" data-testid="gate-summary-list">
                {uploads.map((u) => (
                  <li key={u.id}>
                    <Link href={`/gate-reconciliation/${encodeURIComponent(u.id)}`} className="flex min-h-11 flex-col gap-1 py-3 hover:bg-accent-subtle sm:flex-row sm:items-center sm:justify-between sm:px-2" data-testid="gate-summary-row">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {u.projectCode} · {formatMonth(u.periodMonth)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{u.projectName}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="tabular text-sm text-muted-foreground">{summaryText(u.matchedPct, u.totalExceptions)}</span>
                        <UploadState openExceptions={u.openExceptions} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      ) : (
        <MappingsPanel mappings={mappings} organisations={organisations} canEdit={canUpdate} />
      )}
    </div>
  );
}
