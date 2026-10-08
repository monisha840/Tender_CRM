"use client";

import { useMemo } from "react";
import { canView } from "@/lib/data/access";
import { useAppSettings } from "@/components/settings/app-settings-provider";
import { envOverride } from "@/modules/settings/runtime";
import { FEATURE_MODULES, type FeatureModule } from "@/modules/settings/keys";
import { NAV_GROUP_ORDER, NAV_MODULES, type NavModule } from "@/lib/nav";
import { useCurrentPersona, useDb } from "@/store/hooks";

/** Modules the persona may open (`modules`, incl. the bell page) and the sidebar's grouped subset (`groups`). */
export function useVisibleNav(): { modules: NavModule[]; groups: { group: NavModule["group"]; items: NavModule[] }[] } {
  const db = useDb();
  const persona = useCurrentPersona();
  const settings = useAppSettings();
  return useMemo(() => {
    // Settings > Feature toggles hide whole modules; the env flag (when set) overrides the three finance/payroll/daily-work ones.
    const env = envOverride(process.env.NEXT_PUBLIC_FEATURE_FINANCE_PAYROLL);
    const navFeature: Record<string, FeatureModule> = { employees: "payroll", finance: "finance_gst" };
    const enabled = (key: string) => {
      const f: FeatureModule | undefined = navFeature[key] ?? ((FEATURE_MODULES as readonly string[]).includes(key) ? (key as FeatureModule) : undefined);
      if (!f) return true;
      const envGoverned = f === "payroll" || f === "finance_gst" || f === "daily_work";
      return envGoverned && env !== null ? env : settings.features[f];
    };
    const modules = NAV_MODULES.filter((m) => enabled(m.key) && canView(db, persona.user.id, m.key));
    const groups = NAV_GROUP_ORDER.map((group) => ({ group, items: modules.filter((m) => m.group === group && m.inNav !== false) })).filter((g) => g.items.length > 0);
    return { modules, groups };
  }, [db, persona.user.id, settings]);
}

export const isActivePath = (pathname: string, href: string): boolean => pathname === href || pathname.startsWith(`${href}/`);
