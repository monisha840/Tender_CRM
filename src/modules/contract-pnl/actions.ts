"use server";

import { requireUserForAction } from "@/lib/auth/session";
import { can } from "@/lib/server/permissions";
import { isFeatureEnabled } from "@/modules/settings/queries";
import { getSettingValue } from "@/lib/server/settings-read";
import { parseLowMarginPct } from "@/modules/contract-pnl/calc";
import { getProjectPnl, LOW_MARGIN_SETTING_KEY, type ProjectPnlRow } from "@/modules/contract-pnl/service";

export type ProjectPnlResult = { ok: true; data: ProjectPnlRow | null; lowMarginPct: number } | { ok: false; message: string };

/** Loads one project's P&L for the "Profit & Loss" tab on the project page. Checked on the server: contract_pnl:VIEW. */
export async function getProjectPnlAction(projectId: string): Promise<ProjectPnlResult> {
  try {
    const user = await requireUserForAction();
    if (!(await can(user, "contract_pnl", "VIEW"))) return { ok: false, message: "Your role is not allowed to see contract profit and loss." };
    if (!(await isFeatureEnabled("contract_pnl"))) return { ok: false, message: "Contract profit and loss is switched off in Settings." };
    const [data, low] = await Promise.all([getProjectPnl(projectId), getSettingValue<unknown>(LOW_MARGIN_SETTING_KEY, 10)]);
    return { ok: true, data, lowMarginPct: parseLowMarginPct(low) };
  } catch {
    return { ok: false, message: "Could not load profit and loss. Please try again." };
  }
}
