import "server-only";
import type { MoneyLockedItem } from "@/components/charts/money-locked-tiles";
import { requireUser } from "@/lib/auth/session";
import { moneyToNumber } from "@/lib/money";
import { can } from "@/lib/server/permissions";
import { getMoneyLockedSummary } from "@/modules/money-locked/service";
import { isFeatureEnabled } from "@/modules/settings/queries";

/**
 * "Money locked with clients" tiles for the dashboard. Checks the permission and the feature toggle first and never
 * throws: a missing table (migration not applied) or any other failure yields no tiles, so the dashboard still loads.
 */
export async function loadMoneyLockedItems(): Promise<MoneyLockedItem[]> {
  try {
    const user = await requireUser();
    if (!(await can(user, "money_locked", "VIEW"))) return [];
    if (!(await isFeatureEnabled("money_locked"))) return [];
    const s = await getMoneyLockedSummary();
    if (s.count === 0) return [];
    const series = s.series.map((p) => moneyToNumber(p.total));
    const items: MoneyLockedItem[] = [
      {
        key: "total",
        label: "Total locked",
        amount: moneyToNumber(s.total),
        count: s.count,
        hint: s.expiringCount > 0 ? `${s.count} items, ${s.expiringCount} expiring soon` : undefined,
        series,
        href: "/money-locked",
      },
    ];
    for (const c of s.perClient.slice(0, 3)) {
      items.push({ key: `client-${c.clientId}`, label: c.clientName, amount: moneyToNumber(c.total), count: c.count, href: "/money-locked" });
    }
    return items;
  } catch (e) {
    console.error("[dashboard] money locked tiles unavailable", e);
    return [];
  }
}
