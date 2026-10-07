import type { Metadata } from "next";
import { Suspense } from "react";
import { TenderDetail } from "@/components/tenders/tender-detail";
import { decodeRouteId } from "@/lib/data/links";

export const metadata: Metadata = { title: "Tender" };

async function TenderById({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TenderDetail id={decodeRouteId(id)} />;
}

/** `params` is read inside Suspense so the route shell stays instant (tender ids come from the database, not the seed). */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <TenderById params={params} />
    </Suspense>
  );
}
