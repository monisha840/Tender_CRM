"use client";

import { useMemo } from "react";
import type { Dashboard, RegionFilter } from "@/lib/data";
import { moneyToNumber } from "@/lib/money";
import { PHASE67_ENABLED } from "@/lib/features";
import { useAsOfDb } from "@/components/layout/use-as-of-db";
import type { MoneyLockedItem } from "@/components/charts/money-locked-tiles";
import { CommandCentre } from "./command-centre";
import { DeadlinesChart, GstFilingChart, MoneyLockedSection, ProjectHealthChart, ReceivablesAgeingChart, RevenueExpensesChart, ServiceLineValueChart, TenderFunnelChart, WinRateChart } from "./charts";
import { cancelledTenders, deadlines30, wonStageLabel } from "./derive";
import { KpiGrid } from "./kpi-grid";

export interface ViewProps {
  dashboard: Dashboard;
  manpower: number[];
  region: RegionFilter;
  /** "Money locked with clients" tiles (EMD, PBG, retention...). Optional: the section shows an empty state without it. */
  moneyLocked?: MoneyLockedItem[];
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="mb-3 text-sm font-semibold">{children}</h2>;
}

/** Director / CMD and Regional Head: attention first, all 13 client items, then the charts. */
export function DirectorView({ dashboard, manpower, region, moneyLocked }: ViewProps) {
  const db = useAsOfDb();
  const derived = useMemo(
    () => ({ cancelled: cancelledTenders(db, region), wonLabel: wonStageLabel(db), deadlines: deadlines30(db, region) }),
    [db, region],
  );
  return (
    <>
      <CommandCentre dashboard={dashboard} region={region} />
      <div>
        <SectionTitle>Business at a glance</SectionTitle>
        <KpiGrid dashboard={dashboard} manpower={manpower} />
      </div>
      <div>
        <SectionTitle>Tenders and projects</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <TenderFunnelChart data={dashboard.activeTenders} wonLabel={derived.wonLabel} wonCount={dashboard.wonLost.won} wonValue={moneyToNumber(dashboard.wonLost.wonValue)} />
          <WinRateChart data={dashboard.wonLost} cancelled={derived.cancelled} />
          <div className="lg:col-span-2">
            <ProjectHealthChart data={dashboard.activeProjects} />
          </div>
          <ServiceLineValueChart data={dashboard.projectValue} />
          <DeadlinesChart items={derived.deadlines.items} heat={derived.deadlines.heat} total={derived.deadlines.total} />
        </div>
      </div>
      {PHASE67_ENABLED && (
        <div>
          <SectionTitle>Money and compliance</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            <ReceivablesAgeingChart data={dashboard.receivables} />
            <MoneyLockedSection items={moneyLocked} />
            <div className="lg:col-span-2">
              <RevenueExpensesChart data={dashboard.revenueExpenses} />
            </div>
            <GstFilingChart data={dashboard.gst} />
          </div>
        </div>
      )}
    </>
  );
}
