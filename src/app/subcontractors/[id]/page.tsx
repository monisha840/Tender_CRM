import type { Metadata } from "next";
import { Suspense } from "react";
import { decodeRouteId } from "@/lib/data/links";
import { Detail } from "./detail";

export const metadata: Metadata = { title: "Subcontractor" };

async function Resolved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Detail id={decodeRouteId(id)} />;
}

// `params` is request data: read it inside Suspense so the route's shell can render instantly (Next 16 cacheComponents).
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Resolved params={params} />
    </Suspense>
  );
}
