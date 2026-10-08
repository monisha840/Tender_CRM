import type { Metadata } from "next";
import { Suspense } from "react";
import { Home } from "@/components/dashboard/home";
import { loadMoneyLockedItems } from "./money-locked-items";

export const metadata: Metadata = { title: "Dashboard" };

async function Content() {
  return <Home moneyLocked={await loadMoneyLockedItems()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<Home />}>
      <Content />
    </Suspense>
  );
}
