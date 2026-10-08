import { notFound } from "next/navigation";
import { isModuleEnabled } from "@/lib/features";

/** Hidden (404) when the contract_pnl module is switched off. */
export default function ContractPnlLayout({ children }: { children: React.ReactNode }) {
  if (!isModuleEnabled("contract_pnl")) notFound();
  return children;
}
