"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calculator, Info, OctagonAlert } from "lucide-react";
import { toast } from "sonner";
import { Section } from "@/components/tenders/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getPricingContextAction, savePricingAction } from "@/modules/bid-pricing/actions";
import { computePricing, type PricingResult } from "@/modules/bid-pricing/calc";
import type { PricingContext } from "@/modules/bid-pricing/service";

interface FormState {
  manpower: string;
  days: string;
  wageCategory: string;
  rateDate: string;
  dailyWage: string;
  pfPct: string;
  esiPct: string;
  bonusPct: string;
  esiApplicable: boolean;
  overheadPct: string;
  marginPct: string;
  quotedPrice: string;
}

const num = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? 0 : Number(s));
const str = (v: unknown, fallback = "") => (v === null || v === undefined ? fallback : String(v));

function Labelled({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function initialForm(ctx: PricingContext): FormState {
  const s = ctx.saved?.inputs ?? {};
  return {
    manpower: str(s.manpower, "20"),
    days: str(s.days, "365"),
    wageCategory: str(s.wageCategory),
    rateDate: str(s.rateDate, ctx.tender.rateDate),
    dailyWage: str(s.dailyWage),
    pfPct: str(s.pfPct, ctx.rates.pf?.value ?? "12"),
    esiPct: str(s.esiPct, ctx.rates.esi?.value ?? "3.25"),
    bonusPct: str(s.bonusPct, ctx.rates.bonus?.value ?? "8.33"),
    esiApplicable: s.esiApplicable === undefined ? true : s.esiApplicable === true,
    overheadPct: str(s.overheadPct, String(ctx.defaults.overheadPct)),
    marginPct: str(s.marginPct, String(ctx.defaults.marginPct)),
    quotedPrice: str(s.quotedPrice),
  };
}

/**
 * Bid pricing calculator for one tender: manpower x days x wage, statutory minimum wage valid on the rate date, PF / ESI /
 * bonus, overheads and margin. Shows the minimum safe bid and warns when the quote is under cost or under statutory wages.
 * `compact` hides the benchmark detail (used inside the tender page).
 */
export function PricingPanel({ tenderId, compact = false }: { tenderId: string; compact?: boolean }) {
  const [ctx, setCtx] = useState<PricingContext | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  /** Fetches the context; never touches state, so effects can call it freely. */
  const load = useCallback(
    async (category?: string | null, rateDate?: string | null) => {
      const res = await getPricingContextAction({ tenderId, category: category || null, rateDate: rateDate || null });
      return res.ok ? { data: res.data, error: null } : { data: null, error: res.error.code === "FORBIDDEN" ? "Your role cannot view bid pricing." : res.error.message };
    },
    [tenderId],
  );

  useEffect(() => {
    let live = true;
    void (async () => {
      const first = await load();
      if (!live) return;
      if (!first.data) return setError(first.error);
      let c = first.data;
      // A saved calculation reloads with its own category/date, so fetch the rates for those.
      const savedCat = typeof c.saved?.inputs.wageCategory === "string" ? c.saved.inputs.wageCategory : "";
      const savedDate = typeof c.saved?.inputs.rateDate === "string" ? c.saved.inputs.rateDate : "";
      if (c.saved && (savedCat || (savedDate && savedDate !== c.tender.rateDate))) {
        const again = await load(savedCat, savedDate);
        if (!live) return;
        if (again.data) c = { ...again.data, saved: c.saved };
      }
      setError(null);
      setCtx(c);
      setSavedAt(c.saved?.updatedAt ?? null);
      setForm(initialForm(c));
    })();
    return () => {
      live = false;
    };
  }, [load]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  /** Category / date change: refetch the statutory rates valid then. */
  async function refreshRates(category: string, rateDate: string) {
    const { data: c, error: err } = await load(category, rateDate);
    if (!c) return setError(err);
    {
      setError(null);
      setCtx(c);
      setForm((f) => (f ? { ...f, pfPct: c.rates.pf?.value ?? f.pfPct, esiPct: c.rates.esi?.value ?? f.esiPct, bonusPct: c.rates.bonus?.value ?? f.bonusPct } : f));
    }
  }

  const result: PricingResult | null = useMemo(() => {
    if (!ctx || !form) return null;
    return computePricing(
      {
        manpower: num(form.manpower), days: num(form.days), minWagePerDay: ctx.rates.minWage?.perDay ?? "0", dailyWage: form.dailyWage || null,
        pfPct: num(form.pfPct), esiPct: num(form.esiPct), bonusPct: num(form.bonusPct), esiApplicable: form.esiApplicable,
        overheadPct: num(form.overheadPct), marginPct: num(form.marginPct), quotedPrice: form.quotedPrice || null,
      },
      ctx.benchmarks,
    );
  }, [ctx, form]);

  async function save() {
    if (!form || !ctx) return;
    setSaving(true);
    const res = await savePricingAction({
      tenderId, manpower: Math.trunc(num(form.manpower)), days: Math.trunc(num(form.days)), wageCategory: form.wageCategory || null, rateDate: form.rateDate || null,
      dailyWage: form.dailyWage.trim() || null, pfPct: num(form.pfPct), esiPct: num(form.esiPct), bonusPct: num(form.bonusPct), esiApplicable: form.esiApplicable,
      overheadPct: num(form.overheadPct), marginPct: num(form.marginPct), quotedPrice: form.quotedPrice.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      const fields = res.error.fieldErrors ? Object.values(res.error.fieldErrors).flat().join(" ") : "";
      toast.error(res.error.code === "FORBIDDEN" ? "Your role is not allowed to save bid pricing." : fields || res.error.message);
      return;
    }
    setSavedAt(new Date().toISOString());
    toast.success("Pricing saved");
  }

  // Embedded in the tender page: stay out of the way when the module is off or the role cannot see it.
  if (error && !ctx && compact) return null;
  if (error && !ctx) {
    return (
      <Section title="Pricing">
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      </Section>
    );
  }
  if (!ctx || !form || !result) {
    return (
      <Section title="Pricing">
        <p className="text-sm text-muted-foreground">Loading pricing…</p>
      </Section>
    );
  }

  const minWage = ctx.rates.minWage;
  const rows: [string, string][] = [
    [`Wages (${result.manDays.toLocaleString("en-IN")} man-days at ${formatINR(result.dailyWage)})`, result.wageCost],
    [`PF employer ${form.pfPct}%`, result.pfCost],
    [form.esiApplicable ? `ESI employer ${form.esiPct}%` : "ESI (not applicable)", result.esiCost],
    [`Bonus ${form.bonusPct}%`, result.bonusCost],
    [`Overheads ${form.overheadPct}%`, result.overheadCost],
  ];

  return (
    <Section
      title="Pricing"
      hint="Minimum safe bid from our own costs and the statutory wage floor"
      className="mb-4"
      action={
        <Button className="min-h-11 sm:min-h-8" onClick={save} disabled={saving} data-testid="pricing-save">
          {saving ? "Saving…" : "Save pricing"}
        </Button>
      }
    >
      <div data-testid="pricing-panel" className="space-y-5">
        {result.warnings.length > 0 && (
          <div className="space-y-2" data-testid="pricing-warnings">
            {result.warnings.map((w) => (
              <p
                key={w.code}
                role="alert"
                data-testid={`pricing-warning-${w.code}`}
                className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-sm", w.severity === "danger" ? "bg-status-danger/10 text-status-danger" : "bg-status-warning/10 text-status-warning")}
              >
                {w.severity === "danger" ? <OctagonAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                <span>{w.message}</span>
              </p>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Labelled label="Manpower (people)" htmlFor="pr-manpower">
            <Input id="pr-manpower" data-testid="pricing-manpower" inputMode="numeric" value={form.manpower} onChange={(e) => set("manpower", e.target.value)} />
          </Labelled>
          <Labelled label="Days" htmlFor="pr-days">
            <Input id="pr-days" data-testid="pricing-days" inputMode="numeric" value={form.days} onChange={(e) => set("days", e.target.value)} />
          </Labelled>
          <Labelled label="Wage category" htmlFor="pr-category">
            <select
              id="pr-category"
              data-testid="pricing-category"
              value={form.wageCategory}
              onChange={(e) => {
                set("wageCategory", e.target.value);
                void refreshRates(e.target.value, form.rateDate);
              }}
              className="h-11 w-full rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:text-sm"
            >
              <option value="">General</option>
              {ctx.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Rates valid on" htmlFor="pr-ratedate">
            <Input
              id="pr-ratedate"
              type="date"
              value={form.rateDate}
              onChange={(e) => {
                set("rateDate", e.target.value);
                if (e.target.value) void refreshRates(form.wageCategory, e.target.value);
              }}
            />
          </Labelled>
          <Labelled label="Planned wage / day (₹)" htmlFor="pr-wage" hint={minWage ? `Blank = minimum ${formatINR(minWage.perDay)}` : undefined}>
            <Input id="pr-wage" data-testid="pricing-wage" inputMode="decimal" value={form.dailyWage} placeholder={minWage?.perDay} onChange={(e) => set("dailyWage", e.target.value)} />
          </Labelled>
          <Labelled label="PF employer %" htmlFor="pr-pf">
            <Input id="pr-pf" inputMode="decimal" value={form.pfPct} onChange={(e) => set("pfPct", e.target.value)} />
          </Labelled>
          <Labelled label="ESI employer %" htmlFor="pr-esi">
            <Input id="pr-esi" inputMode="decimal" value={form.esiPct} onChange={(e) => set("esiPct", e.target.value)} />
          </Labelled>
          <Labelled label="Bonus %" htmlFor="pr-bonus">
            <Input id="pr-bonus" inputMode="decimal" value={form.bonusPct} onChange={(e) => set("bonusPct", e.target.value)} />
          </Labelled>
          <Labelled label="Overheads %" htmlFor="pr-oh">
            <Input id="pr-oh" data-testid="pricing-overhead" inputMode="decimal" value={form.overheadPct} onChange={(e) => set("overheadPct", e.target.value)} />
          </Labelled>
          <Labelled label="Target margin %" htmlFor="pr-margin">
            <Input id="pr-margin" data-testid="pricing-margin" inputMode="decimal" value={form.marginPct} onChange={(e) => set("marginPct", e.target.value)} />
          </Labelled>
          <Labelled label="Quoted price (₹)" htmlFor="pr-quote" hint={`Estimated ${formatINR(ctx.tender.estimatedValue, { compact: "auto" })}`}>
            <Input id="pr-quote" data-testid="pricing-quote" inputMode="decimal" value={form.quotedPrice} onChange={(e) => set("quotedPrice", e.target.value)} />
          </Labelled>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={form.esiApplicable} onChange={(e) => set("esiApplicable", e.target.checked)} className="size-4 accent-[var(--accent-strong)]" />
            ESI applies
          </label>
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {minWage
            ? `Minimum wage ${formatINR(minWage.perDay)}/day (${minWage.unit === "AMOUNT_PER_MONTH" ? "monthly rate ÷ 26" : "daily rate"}), in force since ${minWage.effectiveFrom}${minWage.sourceNote ? ` · ${minWage.sourceNote}` : ""}.`
            : "No minimum wage rate (MIN_WAGE) is on file for this date. Add it under Statutory rates before saving."}
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm" data-testid="pricing-breakdown">
              <tbody>
                {rows.map(([label, value]) => (
                  <tr key={label} className="border-b last:border-b-0">
                    <td className="px-3 py-2">{label}</td>
                    <td className="tabular px-3 py-2 text-right">{formatINR(value)}</td>
                  </tr>
                ))}
                <tr className="border-b bg-accent-subtle font-medium">
                  <td className="px-3 py-2">Total cost</td>
                  <td className="tabular px-3 py-2 text-right" data-testid="pricing-total-cost">
                    {formatINR(result.totalCost)}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 text-muted-foreground">Statutory wage cost (floor)</td>
                  <td className="tabular px-3 py-2 text-right" data-testid="pricing-statutory">
                    {formatINR(result.statutoryWageCost)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <dl className="grid grid-cols-2 gap-3 self-start">
            <div className="rounded-md border p-3">
              <dt className="text-xs text-muted-foreground">Minimum safe bid</dt>
              <dd className="tabular mt-1 text-lg font-semibold" data-testid="pricing-min-bid">
                {formatINR(result.minSafeBid, { compact: "auto" })}
              </dd>
              <dd className="text-xs text-muted-foreground">at {form.marginPct || 0}% margin</dd>
            </div>
            <div className="rounded-md border p-3">
              <dt className="text-xs text-muted-foreground">Margin at quote</dt>
              <dd className={cn("tabular mt-1 text-lg font-semibold", result.marginAtQuote && Number(result.marginAtQuote) < 0 && "text-status-danger")} data-testid="pricing-margin-at-quote">
                {result.marginAtQuote ? formatINR(result.marginAtQuote, { compact: "auto" }) : "—"}
              </dd>
              <dd className="tabular text-xs text-muted-foreground">{result.marginPctAtQuote ? `${Number(result.marginPctAtQuote).toFixed(1)}% of price` : "Enter a quoted price"}</dd>
            </div>
          </dl>
        </div>

        {!compact && (
          <div data-testid="pricing-benchmarks">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Calculator className="size-4 text-accent-strong" aria-hidden="true" />
              Similar past projects ({ctx.tender.serviceLineName}, {ctx.tender.regionName})
            </h3>
            {ctx.benchmarks.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No past project in this service line and region has cost data yet.</p>
            ) : (
              <>
                <p className="mb-2 text-sm text-muted-foreground">
                  Average margin {ctx.benchmarks.avgMarginPct !== null ? `${ctx.benchmarks.avgMarginPct.toFixed(1)}%` : "n/a"} across {ctx.benchmarks.rows.length} project(s).
                </p>
                <ul className="divide-y rounded-md border text-sm">
                  {ctx.benchmarks.rows.slice(0, 5).map((b) => (
                    <li key={b.projectId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
                      <span className="min-w-0 break-words">
                        {b.projectCode} · {b.projectName}
                      </span>
                      <span className="tabular text-muted-foreground">
                        cost {formatINR(b.actualCost, { compact: "auto" })} · margin {formatINR(b.margin, { compact: "auto" })}
                        {b.marginPct !== null ? ` (${b.marginPct.toFixed(1)}%)` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {savedAt && <p className="text-xs text-muted-foreground">Last saved {new Date(savedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>}
      </div>
    </Section>
  );
}
