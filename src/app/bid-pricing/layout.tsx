import { ModuleGate } from "@/components/bid-pricing/module-gate";

export default function BidPricingLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGate moduleKey="bid_pricing">{children}</ModuleGate>;
}
