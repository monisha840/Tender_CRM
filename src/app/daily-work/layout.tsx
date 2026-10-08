import { notFound } from "next/navigation";
import { loadAppSettings } from "@/modules/settings/queries";
import { envOverride, isFeatureOn } from "@/modules/settings/runtime";

/** Daily work is hidden until its feature toggle (Settings) or the env flag. */
export default async function DailyWorkLayout({ children }: { children: React.ReactNode }) {
  const settings = await loadAppSettings(); // Settings > Feature toggles; the env flag still overrides
  if (!isFeatureOn("daily_work", envOverride(process.env.NEXT_PUBLIC_FEATURE_FINANCE_PAYROLL), settings)) notFound();
  return children;
}
