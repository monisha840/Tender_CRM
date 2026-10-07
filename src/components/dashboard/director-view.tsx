"use client";

import type { Dashboard, RegionFilter } from "@/lib/data";
import { AttentionArea } from "./attention";
import { GstFilingChart, ProjectProgressChart, ReceivablesAgeingChart, RevenueExpensesChart, ServiceLineValueChart, TenderFunnelChart, WonLostChart } from "./charts";
import { KpiGrid } from "./kpi-grid";

export interface ViewProps {
  dashboard: Dashboard;
  manpower: number[];
  region: RegionFilter;
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="mb-3 text-sm font-semibold">{children}</h2>;
}

/** Director / CMD and Regional Head: attention first, all 13 client items, then the charts. */
export function DirectorView({ dashboard, manpower, region }: ViewProps) {
  return (
    <>
      <AttentionArea region={region} />
      <div>
        <SectionTitle>Business at a glance</SectionTitle>
        <KpiGrid dashboard={dashboard} manpower={manpower} />
      </div>
      <div>
        <SectionTitle>Tenders and projects</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <TenderFunnelChart data={dashboard.activeTenders} />
          <WonLostChart data={dashboard.wonLost} />
          <ProjectProgressChart data={dashboard.activeProjects} />
          <ServiceLineValueChart data={dashboard.projectValue} />
        </div>
      </div>
      <div>
        <SectionTitle>Money and compliance</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <RevenueExpensesChart data={dashboard.revenueExpenses} />
          <ReceivablesAgeingChart data={dashboard.receivables} />
          <GstFilingChart data={dashboard.gst} />
        </div>
      </div>
    </>
  );
}
