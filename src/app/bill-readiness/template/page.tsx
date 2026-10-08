import type { Metadata } from "next";
import { Suspense } from "react";
import { TemplateAdmin } from "@/components/bill-readiness/template-admin";
import { EmptyState } from "@/components/shared/empty-state";
import { moduleAccess } from "@/modules/documents/access";
import { loadTemplate } from "@/modules/bill-readiness/queries";

export const metadata: Metadata = { title: "Bill readiness checklist items" };

async function Template() {
  const access = await moduleAccess("bill_readiness");
  if (!access.canUpdate) {
    return (
      <div className="rounded-lg border bg-surface">
        <EmptyState message="Your role cannot edit the checklist items." action={{ label: "Back to bill readiness", href: "/bill-readiness" }} />
      </div>
    );
  }
  const rows = await loadTemplate();
  return <TemplateAdmin rows={rows.map((r) => ({ id: r.id, code: r.code, label: r.label, isMandatory: r.isMandatory, sortOrder: r.sortOrder, isActive: r.isActive }))} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Template />
    </Suspense>
  );
}
