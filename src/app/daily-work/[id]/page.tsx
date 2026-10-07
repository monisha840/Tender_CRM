import type { Metadata } from "next";
import { decodeRouteId } from "@/lib/data/links";
import { buildSeedDatabase } from "@/lib/data/seed";
import { Detail } from "./detail";

export const metadata: Metadata = { title: "Daily report" };

/** Every seeded record gets its page ready ahead of time (the shell reads the pathname). */
export function generateStaticParams() {
  return buildSeedDatabase().dailyReports.map((r) => ({ id: r.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Detail id={decodeRouteId(id)} />;
}
