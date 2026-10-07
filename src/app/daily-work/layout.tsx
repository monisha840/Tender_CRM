import { notFound } from "next/navigation";
import { PHASE67_ENABLED } from "@/lib/features";

/** Daily work is hidden until PHASE67_ENABLED (src/lib/features.ts). */
export default function DailyWorkLayout({ children }: { children: React.ReactNode }) {
  if (!PHASE67_ENABLED) notFound();
  return children;
}
