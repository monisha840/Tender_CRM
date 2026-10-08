import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PricingPanel } from "@/components/bid-pricing/pricing-panel";
import { PageHeader } from "@/components/layout/page-header";
import { decodeRouteId } from "@/lib/data/links";

export const metadata: Metadata = { title: "Tender pricing" };

async function Body({ params }: { params: Promise<{ tenderId: string }> }) {
  const { tenderId } = await params;
  const id = decodeRouteId(tenderId);
  return (
    <>
      <PageHeader title="Tender pricing" secondaryActions={[{ label: "Open tender", href: `/tenders/${encodeURIComponent(id)}` }]} />
      <PricingPanel tenderId={id} />
    </>
  );
}

export default function Page({ params }: { params: Promise<{ tenderId: string }> }) {
  return (
    <>
      <Link href="/bid-pricing" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-accent-strong hover:underline sm:min-h-0">
        <ArrowLeft className="size-4" aria-hidden="true" /> All bid pricing
      </Link>
      <Suspense fallback={null}>
        <Body params={params} />
      </Suspense>
    </>
  );
}
