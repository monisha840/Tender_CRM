import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Calculator } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/money";
import { listPricingRows } from "@/modules/bid-pricing/service";

export const metadata: Metadata = { title: "Bid pricing" };

const pct = (v: string | null) => (v === null ? "—" : `${Number(v).toFixed(1)}%`);

function PricingState({ priced, warnings }: { priced: boolean; warnings: number }) {
  if (!priced) return <StatusBadge status="NEUTRAL" label="Not priced" />;
  if (warnings > 0) return <StatusBadge status="RED" tone="danger" label={`${warnings} warning${warnings > 1 ? "s" : ""}`} />;
  return <StatusBadge status="GREEN" tone="success" label="Priced" />;
}

async function Rows() {
  const rows = await listPricingRows();
  if (rows.length === 0) return <EmptyState icon={Calculator} message="Open tenders appear here so you can price them." action={{ label: "Go to tenders", href: "/tenders" }} />;
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border bg-surface md:block">
        <table className="w-full text-sm" data-testid="pricing-table">
          <thead className="border-b bg-background text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Tender</th>
              <th className="px-3 py-2 text-right font-medium">Estimated</th>
              <th className="px-3 py-2 text-right font-medium">Total cost</th>
              <th className="px-3 py-2 text-right font-medium">Min. safe bid</th>
              <th className="px-3 py-2 text-right font-medium">Quoted</th>
              <th className="px-3 py-2 text-right font-medium">Margin</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tenderId} className="border-b last:border-b-0 hover:bg-accent-subtle" data-testid="pricing-row">
                <td className="max-w-xs px-3 py-2">
                  <Link href={`/bid-pricing/${encodeURIComponent(r.tenderId)}`} className="font-medium text-accent-strong hover:underline">
                    {r.tenderNo}
                  </Link>
                  <div className="truncate text-xs text-muted-foreground">{r.title}</div>
                </td>
                <td className="tabular px-3 py-2 text-right">{formatINR(r.estimatedValue, { compact: "auto" })}</td>
                <td className="tabular px-3 py-2 text-right">{formatINR(r.totalCost, { compact: "auto" })}</td>
                <td className="tabular px-3 py-2 text-right">{formatINR(r.minSafeBid, { compact: "auto" })}</td>
                <td className="tabular px-3 py-2 text-right">{formatINR(r.quotedPrice, { compact: "auto" })}</td>
                <td className="tabular px-3 py-2 text-right">{pct(r.marginPctAtQuote)}</td>
                <td className="px-3 py-2">
                  <PricingState priced={r.priced} warnings={r.warningCount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.tenderId}>
            <Link href={`/bid-pricing/${encodeURIComponent(r.tenderId)}`} className="block rounded-lg border bg-surface p-3 hover:bg-accent-subtle">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{r.tenderNo}</span>
                <PricingState priced={r.priced} warnings={r.warningCount} />
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{r.title}</p>
              <dl className="tabular mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Min. safe bid</dt>
                <dd className="text-right">{formatINR(r.minSafeBid, { compact: "auto" })}</dd>
                <dt className="text-muted-foreground">Quoted</dt>
                <dd className="text-right">{formatINR(r.quotedPrice, { compact: "auto" })}</dd>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader title="Bid pricing" description="Minimum safe bid and margin for open tenders, from our own costs and the statutory wage floor." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading tenders…</p>}>
        <Rows />
      </Suspense>
    </>
  );
}
