import type { Metadata } from "next";
import { FinanceView } from "@/components/finance/finance-view";

export const metadata: Metadata = { title: "GST & Finance" };

export default function Page() {
  return <FinanceView />;
}
