"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/session-store";
import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";

/** Desktop sidebar: white surface, thin right border, collapsible to an icon rail. */
export function Sidebar() {
  const collapsed = useSessionStore((s) => s.sidebarCollapsed);
  const toggle = useSessionStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-150 md:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("flex h-14 items-center border-b px-4", collapsed && "justify-center px-0")}>
        <Brand compact={collapsed} />
      </div>
      <SidebarNav collapsed={collapsed} />
      <div className={cn("border-t p-2", collapsed && "flex justify-center")}>
        <Button variant="ghost" size="sm" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed} className={cn(!collapsed && "w-full justify-start")}>
          {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          {!collapsed && "Collapse"}
        </Button>
      </div>
    </aside>
  );
}
