"use client";

import dynamic from "next/dynamic";
import { Menu } from "lucide-react";
import { NotificationsMenu } from "@/components/notifications/notifications-menu";
import { Button } from "@/components/ui/button";
import { Brand } from "./brand";
import { DateFilterControl } from "./date-filter";
import { RegionFilterControl } from "./region-filter";
import { UserMenu } from "./user-menu";

/**
 * Dev-only role switcher. The condition is written out with direct `process.env.NEXT_PUBLIC_*` reads (same rule as
 * `resolveDevRoleSwitcher` in lib/auth/dev-flags.ts) so the bundler folds it at build time and, when off, drops the
 * dynamic import entirely: a normal/production build ships no role switcher code.
 */
const RoleSwitcher =
  process.env.NEXT_PUBLIC_DEV_ROLE_SWITCHER === "true" && process.env.NEXT_PUBLIC_APP_ENV !== "production"
    ? dynamic(() => import("./role-switcher").then((m) => m.RoleSwitcher))
    : null;

/** Top bar: menu (mobile), region filter, notifications, optional dev role switcher and the user menu. */
export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-surface px-3 md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMenu} aria-label="Open menu">
        <Menu aria-hidden="true" />
      </Button>
      <Brand compact className="md:hidden" />
      <div className="flex-1" />
      <RegionFilterControl />
      <DateFilterControl />
      <NotificationsMenu />
      {RoleSwitcher && <RoleSwitcher />}
      <UserMenu />
    </header>
  );
}
