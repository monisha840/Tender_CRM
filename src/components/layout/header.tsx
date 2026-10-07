"use client";

import { Menu } from "lucide-react";
import { NotificationsMenu } from "@/components/notifications/notifications-menu";
import { Button } from "@/components/ui/button";
import { Brand } from "./brand";
import { DateFilterControl } from "./date-filter";
import { RegionFilterControl } from "./region-filter";
import { RoleSwitcher } from "./role-switcher";

/** Top bar: menu (mobile), region filter, notifications and the role switcher. */
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
      <RoleSwitcher />
    </header>
  );
}
