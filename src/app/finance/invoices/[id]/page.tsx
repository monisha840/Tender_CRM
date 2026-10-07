import type { Metadata } from "next";
import { buildSeedDatabase } from "@/lib/data/seed";
import { InvoiceDetail } from "@/components/finance/invoice-detail";

export const metadata: Metadata = { title: "Invoice" };

/** Every seeded invoice gets its page ready ahead of time (the shell reads the pathname). */
export function generateStaticParams() {
  return buildSeedDatabase().invoices.map((r) => ({ id: r.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceDetail id={decodeURIComponent(id)} />;
}
