"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthUser } from "@/components/auth/session-provider";
import { useServerDb } from "@/components/auth/server-db-provider";
import { isBarePath } from "@/lib/auth/public-paths";
import { History, ShieldOff } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { canView } from "@/lib/data/access";
import { formatDate } from "@/lib/dates";
import { findModule } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCurrentPersona, useDb, useHydrated } from "@/store/hooks";
import { useDataStore } from "@/store/data-store";
import { useSessionStore } from "@/store/session-store";
import { BottomNav } from "./bottom-nav";
import { Header } from "./header";
import { MobileDrawer } from "./mobile-drawer";
import { Sidebar } from "./sidebar";

/**
 * Responsive app shell. Desktop: collapsible sidebar + header. Mobile: header + drawer, plus a
 * bottom navigation bar for site roles (mobile-first workflows).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Login and password screens: no sidebar/header and no demo-data hydration.
  if (isBarePath(pathname)) return <>{children}</>;
  return <ShellInner>{children}</ShellInner>;
}

function ShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const authUser = useAuthUser();
  const db = useDb();
  const serverDb = useServerDb();
  const persona = useCurrentPersona();
  const hydrated = useHydrated();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const asOfDate = useSessionStore((s) => s.asOfDate);
  const setAsOfDate = useSessionStore((s) => s.setAsOfDate);

  // Load persisted state after mount so the server render and first client render both use the seed.
  useEffect(() => {
    // The demo data store is only read when there is no server data (dev switcher, styleguide).
    if (!serverDb) void useDataStore.persist.rehydrate();
    void useSessionStore.persist.rehydrate();
  }, [serverDb]);

  // The proxy already redirects anonymous requests; this covers a session that ends while the page is open.
  useEffect(() => {
    // Full navigation to /auth/signout so a session without a usable CRM profile is cleared (no /login <-> / loop).
    if (!authUser) window.location.replace("/auth/signout");
    else if (authUser.mustChangePassword) router.replace("/change-password");
  }, [authUser, router]);

  const siteLayout = persona.role.layout === "SITE";
  const navModule = findModule(pathname);
  const allowed = !navModule || canView(db, persona.user.id, navModule.key);

  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMenu={() => setDrawerOpen(true)} />
        {asOfDate && (
          <div role="status" className="flex items-center justify-between gap-3 border-b border-accent-strong/30 bg-accent-subtle px-4 py-2 text-sm md:px-8">
            <span className="flex min-w-0 items-center gap-2">
              <History className="size-4 shrink-0 text-accent-strong" aria-hidden="true" />
              <span className="min-w-0">
                Viewing data as of <span className="tabular font-medium">{formatDate(asOfDate)}</span>. Later records are hidden.
              </span>
            </span>
            <Button variant="outline" size="sm" className="min-h-11 shrink-0 md:min-h-8" onClick={() => setAsOfDate(null)}>
              Back to today
            </Button>
          </div>
        )}
        <main id="main" className={cn("flex-1 px-4 py-6 md:px-8", siteLayout && "pb-24 md:pb-6")}>
          <div className="mx-auto w-full max-w-7xl">
            {/* The page is always rendered (so Next can validate instant navigation) but stays hidden
                until persisted state has loaded, which avoids flashing the wrong persona's view. */}
            {!hydrated && (
              <div className="space-y-4" aria-busy="true" aria-label="Loading">
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-4 w-80 max-w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            )}
            {/* Keyed on the as-of date so every page remounts and recomputes with the chosen day. */}
            <div key={asOfDate ?? "today"} hidden={!hydrated}>
              {allowed ? (
                children
              ) : (
                <div className="rounded-lg border bg-surface">
                  <EmptyState
                    icon={ShieldOff}
                    message={`${persona.role.name} does not have access to ${navModule?.label}.`}
                    action={{ label: "Go to my home", href: persona.role.homePath }}
                  />
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
      <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
      {siteLayout && <BottomNav onMore={() => setDrawerOpen(true)} />}
    </div>
  );
}
