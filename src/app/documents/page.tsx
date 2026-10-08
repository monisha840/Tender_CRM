import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { DocumentVault } from "@/components/documents/vault";
import { moduleAccess } from "@/modules/documents/access";
import { loadVault } from "@/modules/documents/queries";

export const metadata: Metadata = { title: "Document vault" };

async function Vault() {
  const access = await moduleAccess("documents");
  if (!access.canView) {
    return (
      <div className="rounded-lg border bg-surface">
        <EmptyState message="Your role cannot view the document vault." action={{ label: "Back to dashboard", href: "/dashboard" }} />
      </div>
    );
  }
  const { rows, types, soonDays } = await loadVault();
  return <DocumentVault rows={rows} types={types} soonDays={soonDays} canCreate={access.canCreate} canUpdate={access.canUpdate} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Vault />
    </Suspense>
  );
}
