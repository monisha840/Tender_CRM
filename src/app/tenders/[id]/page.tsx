import type { Metadata } from "next";
import { Suspense } from "react";
import { TenderDetail } from "@/components/tenders/tender-detail";
import { decodeRouteId } from "@/lib/data/links";
import { buildSeedDatabase } from "@/lib/data/seed";

export const metadata: Metadata = { title: "Tender" };

/** Every seeded tender gets its page ready ahead of time (the shell reads the pathname). */
export function generateStaticParams() {
  return buildSeedDatabase().tenders.map((t) => ({ id: t.id }));
}

async function Resolved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TenderDetail id={decodeRouteId(id)} />;
}

// `params` is request data: read it inside Suspense so the route's shell can render instantly (Next 16 cacheComponents).
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Resolved params={params} />
    </Suspense>
  );
}
