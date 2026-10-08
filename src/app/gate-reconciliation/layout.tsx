import { ModuleGate } from "@/components/bid-pricing/module-gate";

export default function GateReconciliationLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate moduleKey="gate_reconciliation">{children}</ModuleGate>;
}
