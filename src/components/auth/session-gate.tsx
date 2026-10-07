import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SessionProvider } from "@/components/auth/session-provider";
import { ServerDbProvider } from "@/components/auth/server-db-provider";
import { getServerDb } from "@/lib/data/server/server-db";
import { getSessionContext } from "@/lib/auth/session";
import { Skeleton } from "@/components/ui/skeleton";

/** Server component: resolves the verified user once per request and hands it to the client shell. */
export async function SessionGate({ children }: { children: ReactNode }) {
  const ctx = await getSessionContext();
  // Real data for the signed-in user (one cached snapshot, see src/lib/data/server/server-db.ts). A failed load throws
  // to the error boundary rather than silently showing demo data.
  const db = ctx ? await getServerDb(ctx.user.id) : null;
  const user = ctx && {
    id: ctx.user.id,
    name: ctx.user.name,
    email: ctx.user.email,
    roleKeys: ctx.user.roleKeys,
    roleLabel: ctx.roleNames.join(", "),
    homePath: ctx.homePath,
    mustChangePassword: ctx.mustChangePassword,
  };
  return (
    <SessionProvider user={user}>
      <ServerDbProvider db={db}>
        <AppShell>{children}</AppShell>
      </ServerDbProvider>
    </SessionProvider>
  );
}

export function SessionGateFallback() {
  return (
    <div className="space-y-4 p-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
