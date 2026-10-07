"use client";

import type { Dashboard, RegionFilter } from "@/lib/data";
import { CommandCentre } from "./command-centre";
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
      <CommandCentre dashboard={dashboard} region={region} />
      <div>
        <SectionTitle>Business at a glance</SectionTitle>
        <KpiGrid dashboard={dashboard} manpower={manpower} />
      </div>
      <div>
        <SectionTitle>Tenders and projects</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-6 lg:[&>*]:col-span-3 lg:[&>*:nth-child(1)]:col-span-4 lg:[&>*:nth-child(2)]:col-span-2 lg:[&>*:nth-child(3)]:col-span-2 lg:[&>*:nth-child(4)]:col-span-4">
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
