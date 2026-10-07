import type { Metadata } from "next";
import { buildSeedDatabase } from "@/lib/data/seed";
import { Detail } from "./detail";

export const metadata: Metadata = { title: "Employee" };

/** Every seeded record gets its page ready ahead of time (the shell reads the pathname). */
export function generateStaticParams() {
  return buildSeedDatabase().employees.map((r) => ({ id: r.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Detail id={decodeURIComponent(id)} />;
}
