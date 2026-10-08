"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import type { SettingsPageData } from "@/modules/settings/queries";
import { ChecklistSection, StagesSection } from "./section-tender";
import { CompanySection, RegionsSection } from "./section-company";
import { DeductionsSection, ProjectsSection, ServiceLinesSection } from "./section-masters";
import { ApprovalsSection, FeaturesSection, RemindersSection, StatutorySection } from "./section-rules";
import { UsersSection } from "./section-users";

export const SETTINGS_SECTIONS = [
  { key: "company", label: "Company profile" },
  { key: "regions", label: "Regions and GSTINs" },
  { key: "stages", label: "Tender stages" },
  { key: "checklist", label: "Document checklists" },
  { key: "services", label: "Service lines and units" },
  { key: "approvals", label: "Approval rules" },
  { key: "reminders", label: "Reminders" },
  { key: "statutory", label: "Statutory rates" },
  { key: "deductions", label: "Deduction types" },
  { key: "projects", label: "Project statuses and health" },
  { key: "features", label: "Feature toggles" },
  { key: "users", label: "Users and roles" },
] as const;
export type SectionKey = (typeof SETTINGS_SECTIONS)[number]["key"];

/** Settings control centre. The server decides `canEdit` / `canEditUsers`; the server actions re-check on every call. */
export function SettingsView({ data, canEdit, canEditUsers, initialSection }: { data: SettingsPageData; canEdit: boolean; canEditUsers: boolean; initialSection?: string }) {
  const first = SETTINGS_SECTIONS.find((s) => s.key === initialSection)?.key ?? "company";
  const [section, setSection] = useState<SectionKey>(first);
  const readOnly = !canEdit;

  function choose(key: SectionKey) {
    setSection(key);
    try { window.history.replaceState(null, "", `?section=${key}`); } catch { /* ignore */ }
  }

  const body = {
    company: <CompanySection data={data} readOnly={readOnly} />,
    regions: <RegionsSection data={data} readOnly={readOnly} />,
    stages: <StagesSection data={data} readOnly={readOnly} />,
    checklist: <ChecklistSection data={data} readOnly={readOnly} />,
    services: <ServiceLinesSection data={data} readOnly={readOnly} />,
    approvals: <ApprovalsSection data={data} readOnly={readOnly} />,
    reminders: <RemindersSection data={data} readOnly={readOnly} />,
    statutory: <StatutorySection data={data} readOnly={readOnly} />,
    deductions: <DeductionsSection data={data} readOnly={readOnly} />,
    projects: <ProjectsSection data={data} readOnly={readOnly} />,
    features: <FeaturesSection data={data} readOnly={readOnly} />,
    users: <UsersSection data={data} readOnly={!canEditUsers} />,
  }[section];

  return (
    <>
      <PageHeader
        title="Settings"
        description="Business rules live here, not in code. A change takes effect straight away and is recorded in the audit log."
        status={readOnly ? <span data-testid="settings-view-only" className="rounded-md bg-status-neutral-tint px-2 py-0.5 text-xs font-medium text-status-neutral">View only</span> : undefined}
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <nav aria-label="Settings sections" className="-mx-4 shrink-0 overflow-x-auto px-4 lg:mx-0 lg:w-56 lg:overflow-visible lg:px-0">
          <div role="tablist" aria-orientation="vertical" className="flex gap-1 border-b lg:flex-col lg:border-b-0">
            {SETTINGS_SECTIONS.map((s) => (
              <button
                key={s.key}
                role="tab"
                id={`settings-tab-${s.key}`}
                aria-selected={section === s.key}
                aria-controls="settings-panel"
                data-testid={`settings-tab-${s.key}`}
                onClick={() => choose(s.key)}
                className={cn(
                  "-mb-px flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md border-b-2 px-3 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-accent-strong md:min-h-9 lg:mb-0 lg:border-b-0 lg:border-l-2",
                  section === s.key ? "border-accent bg-accent-subtle text-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </nav>
        <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${section}`} className="min-w-0 flex-1" data-testid="settings-panel">
          {body}
        </div>
      </div>
    </>
  );
}
