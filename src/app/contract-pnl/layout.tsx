import { notFound } from "next/navigation";
import { isFeatureEnabled } from "@/modules/settings/queries";

/** Hidden (404) when the contract_pnl module is switched off. */
export default async function ContractPnlLayout({ children }: { children: React.ReactNode }) {
  if (!(await isFeatureEnabled("contract_pnl"))) notFound();
  return children;
}
