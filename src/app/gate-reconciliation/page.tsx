import type { Metadata } from "next";
import { Suspense } from "react";
import { GateWorkspace } from "@/components/gate-reconciliation/gate-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { moduleAccess } from "@/modules/bid-pricing/feature";
import { listMappings, listProjectOptions, listUploadSummaries } from "@/modules/gate-reconciliation/queries";

export const metadata: Metadata = { title: "Gate attendance" };

async function Body() {
  const [access, projects, maps, uploads] = await Promise.all([moduleAccess("gate_reconciliation"), listProjectOptions(), listMappings(), listUploadSummaries()]);
  return <GateWorkspace projects={projects} mappings={maps.mappings} organisations={maps.organisations} uploads={uploads} canCreate={access.canCreate} canUpdate={access.canUpdate} />;
}

export default function Page() {
  return (
    <>
      <PageHeader title="Gate attendance" description="Compare the client's gate attendance with ours, worker by worker, and clear the differences before billing." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Body />
      </Suspense>
    </>
  );
}
