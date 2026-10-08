import { notFound } from "next/navigation";
import { isModuleEnabled } from "@/lib/features";

/** Hidden (404) when the money_locked module is switched off. */
export default function MoneyLockedLayout({ children }: { children: React.ReactNode }) {
  if (!isModuleEnabled("money_locked")) notFound();
  return children;
}
