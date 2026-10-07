import { notFound } from "next/navigation";
import { PHASE67_ENABLED } from "@/lib/features";

/** GST and finance screens are hidden until PHASE67_ENABLED (src/lib/features.ts). */
export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  if (!PHASE67_ENABLED) notFound();
  return children;
}
