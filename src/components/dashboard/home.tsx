"use client";

import { useMemo } from "react";
import type { MoneyLockedItem } from "@/components/charts/money-locked-tiles";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard, getManpowerTrend } from "@/lib/data";
import { formatDate, getToday } from "@/lib/dates";
import { useCurrentPersona, useHydrated, useRegionFilter } from "@/store/hooks";
import { useAsOfDb } from "@/components/layout/use-as-of-db";
import { FinanceView, ProjectsView, TenderView } from "./role-views";
import { SiteView } from "./site-view";
import { DirectorView } from "./director-view";

const VIEW_NAME: Record<string, string> = {
  director: "Director overview",
  regional_head: "Regional overview",
  accounts: "Finance overview",
  project_manager: "Project overview",
  tender_exec: "Tender overview",
  legal_admin: "Tender overview",
  site_engineer: "My site",
  supervisor: "My site",
};

/** One home screen, different content per role. The region filter in the header applies to every widget. */
export function Home({ moneyLocked }: { moneyLocked?: MoneyLockedItem[] } = {}) {
  const db = useAsOfDb();
  const persona = useCurrentPersona();
  const { region } = useRegionFilter();
  const hydrated = useHydrated();
  const key = persona.role.key;

  const dashboard = useMemo(() => getDashboard(db, region), [db, region]);
  const manpower = useMemo(() => getManpowerTrend(db, region, 14).map((t) => t.workers), [db, region]);

  const header = (
    <PageHeader
      title={key === "site_engineer" || key === "supervisor" ? "My site" : "Dashboard"}
      description={`${VIEW_NAME[key] ?? "Overview"} · ${persona.user.name} · as of ${formatDate(getToday())}`}
      primaryAction={key === "site_engineer" || key === "supervisor" ? { label: "Daily report", href: "/daily-work" } : { label: "Approvals inbox", href: "/approvals" }}
    />
  );

  if (!hydrated) {
    return (
      <>
        {header}
        <Skeleton className="h-64 w-full" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="space-y-6">
        {key === "site_engineer" || key === "supervisor" ? (
          <SiteView region={region} />
        ) : key === "accounts" ? (
          <FinanceView dashboard={dashboard} manpower={manpower} region={region} />
        ) : key === "project_manager" ? (
          <ProjectsView dashboard={dashboard} manpower={manpower} region={region} />
        ) : key === "tender_exec" || key === "legal_admin" ? (
          <TenderView dashboard={dashboard} manpower={manpower} region={region} />
        ) : (
          <DirectorView dashboard={dashboard} manpower={manpower} region={region} moneyLocked={moneyLocked} />
        )}
        <p className="text-xs text-muted-foreground">
          Every tile and chart opens the related list. Notifications are in the bell at the top.
        </p>
      </div>
    </>
  );
}
