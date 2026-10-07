"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isActivePath, useVisibleNav } from "./use-nav";

interface SidebarNavProps {
  /** Icon-only rail (desktop). */
  collapsed?: boolean;
  /** Called after a link is chosen, e.g. to close the mobile drawer. */
  onNavigate?: () => void;
}

/** Grouped navigation shared by the desktop sidebar and the mobile drawer. */
export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const { groups } = useVisibleNav();

  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-3">
      {groups.map(({ group, items }, gi) => (
        <div key={group} className={cn(gi > 0 && "mt-4")}>
          {collapsed ? (
            gi > 0 && <div className="mx-2 mb-2 border-t" aria-hidden="true" />
          ) : (
            <p className="px-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{group}</p>
          )}
          <ul className="space-y-0.5">
            {items.map((m) => {
              const active = isActivePath(pathname, m.href);
              const Icon = m.icon;
              const link = (
                <Link
                  href={m.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm md:min-h-9",
                    collapsed && "justify-center px-0",
                    active ? "bg-accent-subtle font-medium text-foreground" : "text-foreground hover:bg-muted",
                  )}
                >
                  {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-accent" aria-hidden="true" />}
                  <Icon className={cn("size-4 shrink-0", active && "text-accent-strong")} aria-hidden="true" />
                  <span className={cn(collapsed && "sr-only")}>{m.label}</span>
                </Link>
              );
              return (
                <li key={m.key}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger render={link} />
                      <TooltipContent side="right">{m.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
