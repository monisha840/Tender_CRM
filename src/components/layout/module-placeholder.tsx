import { Clock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { getModule } from "@/lib/nav";

/** Neutral stand-in for a module whose screens are not built yet. */
export function ModulePlaceholder({ moduleKey }: { moduleKey: string }) {
  const mod = getModule(moduleKey);
  return (
    <>
      <PageHeader title={mod.label} />
      <div className="rounded-lg border bg-surface">
        <EmptyState icon={Clock} message="Coming soon" />
      </div>
    </>
  );
}
