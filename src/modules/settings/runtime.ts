/**
 * Client-safe snapshot of the settings the app reads at run time (health thresholds, reminder bands, billing
 * defaults, feature toggles). The server loads it from the Setting table and `AppSettingsProvider` installs it
 * before children render; pure functions call `getAppSettings()` and fall back to the defaults, so unit tests
 * and screens without a provider behave exactly as before.
 */
import { FEATURE_MODULES, PHASE67_FEATURES, SETTING_KEYS, featureKey, parseSetting, settingDefault, type FeatureModule } from "./keys";

export interface AppSettings {
  reminders: { enabled: boolean; deadlineDays: number[]; documentExpiryDays: number[]; moneyLockedExpiryDays: number[] };
  health: { amberDelayPct: number; redDelayPct: number };
  billing: { defaultGstPct: number; paymentTermsDays: number };
  pnl: { lowMarginPct: number };
  approvals: { makerChecker: boolean; dueDays: number };
  features: Record<FeatureModule, boolean>;
}

/** Build the snapshot from raw `key -> stored value` pairs (anything missing or invalid takes its default). */
/** Finance / payroll / daily-work default: off in production until switched on, on elsewhere (as the old env-only flag did). */
const phase67Default = (): boolean => (process.env.NEXT_PUBLIC_APP_ENV || process.env.APP_ENV)?.trim().toLowerCase() !== "production";

export function resolveAppSettings(raw: Record<string, unknown> = {}): AppSettings {
  const g = <T,>(key: string) => parseSetting<T>(key, raw[key]);
  const features = Object.fromEntries(
    FEATURE_MODULES.map((m) => [m, raw[featureKey(m)] === undefined && PHASE67_FEATURES.includes(m) ? phase67Default() : g<boolean>(featureKey(m))]),
  ) as Record<FeatureModule, boolean>;
  let amber = g<number>(SETTING_KEYS.healthAmberDelayPct);
  let red = g<number>(SETTING_KEYS.healthRedDelayPct);
  if (amber >= red) {
    amber = settingDefault<number>(SETTING_KEYS.healthAmberDelayPct);
    red = settingDefault<number>(SETTING_KEYS.healthRedDelayPct);
  }
  return {
    reminders: {
      enabled: g<boolean>(SETTING_KEYS.remindersEnabled),
      deadlineDays: g<number[]>(SETTING_KEYS.deadlineDays),
      documentExpiryDays: g<number[]>(SETTING_KEYS.documentExpiryDays),
      moneyLockedExpiryDays: g<number[]>(SETTING_KEYS.moneyLockedExpiryDays),
    },
    health: { amberDelayPct: amber, redDelayPct: red },
    billing: { defaultGstPct: g<number>(SETTING_KEYS.billingDefaultGstPct), paymentTermsDays: g<number>(SETTING_KEYS.billingPaymentTermsDays) },
    pnl: { lowMarginPct: g<number>(SETTING_KEYS.pnlLowMarginPct) },
    approvals: { makerChecker: g<boolean>(SETTING_KEYS.approvalsMakerChecker), dueDays: g<number>(SETTING_KEYS.approvalsDueDays) },
    features,
  };
}

export const DEFAULT_APP_SETTINGS: AppSettings = resolveAppSettings();

let current: AppSettings = DEFAULT_APP_SETTINGS;

export function getAppSettings(): AppSettings {
  return current;
}
/** Install the snapshot (idempotent). Called by the provider on every render with the server-loaded value. */
export function setAppSettings(next: AppSettings | null | undefined): void {
  current = next ?? DEFAULT_APP_SETTINGS;
}

/**
 * Reminder bands from the deadline day list, e.g. [7,3,1] -> soon within 7 days, urgent within 3 days.
 * With one value it is both the soon and the urgent limit.
 */
export function deadlineBands(days: number[] = current.reminders.deadlineDays): { soon: number; urgent: number } {
  const d = [...days].sort((a, b) => b - a);
  return { soon: d[0] ?? 7, urgent: d[1] ?? d[0] ?? 3 };
}

/** The env flag as tri-state: true / false when explicitly set, null when unset. */
export function envOverride(flag: string | undefined): boolean | null {
  const v = flag?.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return null;
}

/**
 * Feature toggle with the env override: the finance/payroll/daily-work screens follow NEXT_PUBLIC_FEATURE_FINANCE_PAYROLL
 * when it is explicitly true/false (`envFlag`), otherwise the stored toggle.
 */
export function isFeatureOn(module: FeatureModule, envFlag: boolean | null, settings: AppSettings = current): boolean {
  if (envFlag !== null && PHASE67_FEATURES.includes(module)) return envFlag;
  return settings.features[module];
}
