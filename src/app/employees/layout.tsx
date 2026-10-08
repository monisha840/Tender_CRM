import { notFound } from "next/navigation";
import { loadAppSettings } from "@/modules/settings/queries";
import { envOverride, isFeatureOn } from "@/modules/settings/runtime";

/** Employees and payroll are hidden until its feature toggle (Settings) or the env flag. */
export default async function EmployeesLayout({ children }: { children: React.ReactNode }) {
  const settings = await loadAppSettings(); // Settings > Feature toggles; the env flag still overrides
  if (!isFeatureOn("payroll", envOverride(process.env.NEXT_PUBLIC_FEATURE_FINANCE_PAYROLL), settings)) notFound();
  return children;
}
