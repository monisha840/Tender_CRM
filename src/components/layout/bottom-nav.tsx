"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { getUnreadCount } from "@/lib/data/notifications";
import { cn } from "@/lib/utils";
import { useCurrentPersona, useDb } from "@/store/hooks";
import { isActivePath, useVisibleNav } from "./use-nav";

/** Mobile bottom navigation for site roles: up to four modules plus "More" (opens the drawer). */
export function BottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const db = useDb();
  const persona = useCurrentPersona();
  const { modules } = useVisibleNav();
  const unread = getUnreadCount(db, persona.user.id);
  // The persona's home module comes first, then the rest in nav order.
  const items = [...modules].sort((a, b) => Number(b.href === persona.role.homePath) - Number(a.href === persona.role.homePath)).slice(0, 4);

  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
        {items.map((m) => {
          const active = isActivePath(pathname, m.href);
          const Icon = m.icon;
          return (
            <li key={m.key}>
              <Link
                href={m.href}
                aria-current={active ? "page" : undefined}
                className={cn("relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "font-medium text-foreground" : "text-muted-foreground")}
              >
                {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-b-full bg-accent" aria-hidden="true" />}
                <span className="relative">
                  <Icon className={cn("size-5", active && "text-accent-strong")} aria-hidden="true" />
                  {m.key === "notifications" && unread > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 text-accent-foreground">{unread}</span>
                  )}
                </span>
                {m.shortLabel ?? m.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={onMore} className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground">
            <Menu className="size-5" aria-hidden="true" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
