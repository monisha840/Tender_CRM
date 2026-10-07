import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export const metadata: Metadata = { title: "Daily Work" };

export default function Page() {
  return <ModulePlaceholder moduleKey="daily_work" />;
}
