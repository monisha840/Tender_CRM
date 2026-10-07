"use client";

import { useMemo } from "react";
import { KpiTile } from "@/components/shared/kpi-tile";
import { getGstSummary } from "@/lib/data/gst";
import { formatINR, isPositive } from "@/lib/money";
import { useAsOfDb } from "@/components/layout/use-as-of-db";

/**
 * Net GST position from the GST ledger: outward tax less input credit (ITC) less GST deducted at source.
 * A negative net means credit carried forward. Mounted by the GST summary tab; pass the selected GSTIN and period.
 */
export function GstNetPosition({ gstRegistrationId = "ALL", period }: { gstRegistrationId?: string; period?: string }) {
  const db = useAsOfDb();
  const s = useMemo(() => getGstSummary(db, { gstRegistrationId, period }), [db, gstRegistrationId, period]);
  const owes = isPositive(s.netPayable);
  return (
    <section aria-label="Net GST position" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile label="Output tax" value={formatINR(s.outwardTax, { compact: true })} hint={`on ${formatINR(s.outwardTaxable, { compact: true })} billed (excl. GST)`} />
      <KpiTile label="Input tax credit" value={formatINR(s.itcAvailable, { compact: true })} hint={`on ${formatINR(s.inwardTaxable, { compact: true })} purchases`} />
      <KpiTile label="GST deducted at source" value={formatINR(s.tdsReceived, { compact: true })} hint="deducted by departments" />
      <KpiTile
        label={owes ? "Net GST payable" : "Credit carried forward"}
        value={formatINR(owes ? s.netPayable : s.netPayable.replace("-", ""), { compact: true })}
        hint="output tax − input credit − TDS"
      />
    </section>
  );
}
