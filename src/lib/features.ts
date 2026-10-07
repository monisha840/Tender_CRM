/**
 * Feature flags. Read from the environment at build/start; `NEXT_PUBLIC_*` values are inlined into the client bundle,
 * so server and client always agree.
 */

/** Pure resolver, exported for tests. An explicit true/false flag wins; otherwise on everywhere except production. */
export function resolvePhase67(flag: string | undefined, appEnv: string | undefined): boolean {
  const v = flag?.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return appEnv?.trim().toLowerCase() !== "production";
}

/**
 * GST/invoices ("finance"), Employees/payroll and Daily work screens (Phases 2, 6 and 7). Built, but hidden from production users
 * until switched on with NEXT_PUBLIC_FEATURE_FINANCE_PAYROLL=true (see docs/go-live-plan.md scope).
 * Default: false when APP_ENV=production, true in development and test unless set to false.
 * `NEXT_PUBLIC_APP_ENV` mirrors APP_ENV for the client (set in next.config.ts).
 */
export const PHASE67_ENABLED: boolean = resolvePhase67(
  process.env.NEXT_PUBLIC_FEATURE_FINANCE_PAYROLL,
  process.env.NEXT_PUBLIC_APP_ENV || process.env.APP_ENV,
);

/** Nav module keys that belong to the flagged phases. */
export const PHASE67_MODULE_KEYS: readonly string[] = ["employees", "finance", "daily_work"];

export const isModuleEnabled = (key: string, enabled: boolean = PHASE67_ENABLED): boolean => enabled || !PHASE67_MODULE_KEYS.includes(key);
