import type { Metadata } from "next";
import { TenderDetail } from "@/components/tenders/tender-detail";
import { buildSeedDatabase } from "@/lib/data/seed";

export const metadata: Metadata = { title: "Tender" };

/** Every seeded tender gets its page ready ahead of time (the shell reads the pathname). */
export function generateStaticParams() {
  return buildSeedDatabase().tenders.map((t) => ({ id: t.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TenderDetail id={id} />;
}
