"use client";

import { useMemo } from "react";
import { canView } from "@/lib/data/access";
import { NAV_GROUP_ORDER, NAV_MODULES, type NavModule } from "@/lib/nav";
import { useCurrentPersona, useDb } from "@/store/hooks";

/** Nav modules the current persona may open, in flat and grouped form. */
export function useVisibleNav(): { modules: NavModule[]; groups: { group: NavModule["group"]; items: NavModule[] }[] } {
  const db = useDb();
  const persona = useCurrentPersona();
  return useMemo(() => {
    const modules = NAV_MODULES.filter((m) => canView(db, persona.user.id, m.key));
    const groups = NAV_GROUP_ORDER.map((group) => ({ group, items: modules.filter((m) => m.group === group) })).filter((g) => g.items.length > 0);
    return { modules, groups };
  }, [db, persona.user.id]);
}

export const isActivePath = (pathname: string, href: string): boolean => pathname === href || pathname.startsWith(`${href}/`);
