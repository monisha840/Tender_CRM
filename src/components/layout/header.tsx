"use client";

import Link from "next/link";
import { Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getUnreadCount } from "@/lib/data/notifications";
import { useCurrentPersona, useDb } from "@/store/hooks";
import { Brand } from "./brand";
import { RegionFilterControl } from "./region-filter";
import { RoleSwitcher } from "./role-switcher";

/** Top bar: menu (mobile), region filter, notifications and the role switcher. */
export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const db = useDb();
  const persona = useCurrentPersona();
  const unread = getUnreadCount(db, persona.user.id);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-surface px-3 md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMenu} aria-label="Open menu">
        <Menu aria-hidden="true" />
      </Button>
      <Brand compact className="md:hidden" />
      <div className="flex-1" />
      <RegionFilterControl />
      <Button variant="ghost" size="icon" className="relative" nativeButton={false} render={<Link href="/notifications" aria-label={`Notifications, ${unread} unread`} />}>
        <Bell aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-medium text-accent-foreground md:top-0 md:right-0">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>
      <RoleSwitcher />
    </header>
  );
}
