import { notFound } from "next/navigation";
import { isFeatureEnabled } from "@/modules/settings/queries";

/** Hidden (404) when the money_locked module is switched off. */
export default async function MoneyLockedLayout({ children }: { children: React.ReactNode }) {
  if (!(await isFeatureEnabled("money_locked"))) notFound();
  return children;
}
