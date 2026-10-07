"use client";

import { useMemo } from "react";
import { canView } from "@/lib/data/access";
import { isModuleEnabled } from "@/lib/features";
import { NAV_GROUP_ORDER, NAV_MODULES, type NavModule } from "@/lib/nav";
import { useCurrentPersona, useDb } from "@/store/hooks";

/** Modules the persona may open (`modules`, incl. the bell page) and the sidebar's grouped subset (`groups`). */
export function useVisibleNav(): { modules: NavModule[]; groups: { group: NavModule["group"]; items: NavModule[] }[] } {
  const db = useDb();
  const persona = useCurrentPersona();
  return useMemo(() => {
    const modules = NAV_MODULES.filter((m) => isModuleEnabled(m.key) && canView(db, persona.user.id, m.key));
    const groups = NAV_GROUP_ORDER.map((group) => ({ group, items: modules.filter((m) => m.group === group && m.inNav !== false) })).filter((g) => g.items.length > 0);
    return { modules, groups };
  }, [db, persona.user.id]);
}

export const isActivePath = (pathname: string, href: string): boolean => pathname === href || pathname.startsWith(`${href}/`);
