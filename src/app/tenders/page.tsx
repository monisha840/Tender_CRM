import type { Metadata } from "next";
import { Suspense } from "react";
import { FocusRedirect } from "@/components/tenders/focus-redirect";
import { TenderList } from "@/components/tenders/tender-list";

export const metadata: Metadata = { title: "Tenders" };

export default function Page() {
  return (
    <>
      <Suspense fallback={null}>
        <FocusRedirect />
      </Suspense>
      <TenderList />
    </>
  );
}
