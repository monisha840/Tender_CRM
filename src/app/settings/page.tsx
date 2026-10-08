import { Suspense } from "react";
import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/server/permissions";
import { loadSettingsPage } from "@/modules/settings/queries";

export const metadata: Metadata = { title: "Settings" };

async function SettingsLoader({ section }: { section?: string }) {
  const user = await requireUser();
  // Edit rights come from the Role/Permission tables; the server actions check them again on every write.
  const [canView, canEdit, canEditUsers, data] = await Promise.all([
    can(user, "settings", "VIEW"),
    can(user, "settings", "EDIT"),
    can(user, "users", "EDIT"),
    loadSettingsPage(),
  ]);
  if (!canView) return <p className="text-sm text-muted-foreground">You do not have access to Settings.</p>;
  return <SettingsView data={data} canEdit={canEdit} canEditUsers={canEditUsers} initialSection={section} />;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await searchParams;
  return (
    <Suspense fallback={<div className="space-y-4" aria-busy="true"><Skeleton className="h-8 w-40" /><Skeleton className="h-64 w-full" /></div>}>
      <SettingsLoader section={section} />
    </Suspense>
  );
}
