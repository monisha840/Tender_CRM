import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Lock } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { moduleAccess } from "@/modules/bid-pricing/feature";

async function Gate({ moduleKey, children }: { moduleKey: "bid_pricing" | "gate_reconciliation"; children: React.ReactNode }) {
  const access = await moduleAccess(moduleKey);
  if (!access.enabled) notFound();
  if (!access.canView) return <EmptyState icon={Lock} message="Your role does not have access to this screen." action={{ label: "Back to dashboard", href: "/dashboard" }} />;
  return <>{children}</>;
}

/** Server layout helper: 404 when the module is switched off in Settings, a polite message without VIEW permission. */
export function ModuleGate({ moduleKey, children }: { moduleKey: "bid_pricing" | "gate_reconciliation"; children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate moduleKey={moduleKey}>{children}</Gate>
    </Suspense>
  );
}
