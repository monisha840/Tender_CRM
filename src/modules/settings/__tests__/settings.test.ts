import { afterEach, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { makeGstin, withValidCheckChar } from "@/lib/gst-validation";
import { relativeDeadline } from "@/lib/dates";
import { computeHealth } from "@/lib/data/projects";
import { reminderBand } from "@/lib/data/tenders";
import { rateOn } from "@/lib/server/settings-read";
import type { Project } from "@/types";
import { gstinSchema, statutoryRateSchema } from "../schema";
import {
  FEATURE_MODULES, SETTING_KEYS, featureKey, healthThresholdError, isKnownSettingKey, parseDayList, parseSetting, settingDefault, validateSetting,
} from "../keys";
import { isPermutation, moveItem, moveToIndex, sequencesFor } from "../reorder";
import { DEFAULT_APP_SETTINGS, deadlineBands, envOverride, isFeatureOn, resolveAppSettings, setAppSettings } from "../runtime";

afterEach(() => setAppSettings(null));

describe("setting keys: defaults and parsing", () => {
  it("exposes the documented defaults", () => {
    expect(settingDefault(SETTING_KEYS.deadlineDays)).toEqual([7, 3, 1]);
    expect(settingDefault(SETTING_KEYS.documentExpiryDays)).toEqual([60, 30, 7]);
    expect(settingDefault(SETTING_KEYS.healthAmberDelayPct)).toBe(5);
    expect(settingDefault(SETTING_KEYS.healthRedDelayPct)).toBe(15);
    expect(settingDefault(SETTING_KEYS.billingDefaultGstPct)).toBe(18);
    expect(settingDefault(SETTING_KEYS.billingPaymentTermsDays)).toBe(30);
    expect(isKnownSettingKey(SETTING_KEYS.pnlLowMarginPct)).toBe(true);
    for (const m of FEATURE_MODULES) expect(isKnownSettingKey(featureKey(m))).toBe(true);
    expect(isKnownSettingKey("nope.nothing")).toBe(false);
  });

  it("falls back to the default for unset or invalid stored values", () => {
    expect(parseSetting(SETTING_KEYS.deadlineDays, undefined)).toEqual([7, 3, 1]);
    expect(parseSetting(SETTING_KEYS.deadlineDays, "garbage")).toEqual([7, 3, 1]);
    expect(parseSetting(SETTING_KEYS.billingDefaultGstPct, 12)).toBe(12);
    expect(parseSetting(SETTING_KEYS.billingDefaultGstPct, 400)).toBe(18);
  });

  it("validates writes, sorts day lists largest first and rejects duplicates", () => {
    expect(validateSetting(SETTING_KEYS.deadlineDays, [1, 10, 3])).toEqual({ ok: true, value: [10, 3, 1] });
    expect(validateSetting(SETTING_KEYS.deadlineDays, [3, 3]).ok).toBe(false);
    expect(validateSetting(SETTING_KEYS.deadlineDays, []).ok).toBe(false);
    expect(validateSetting(SETTING_KEYS.billingDefaultGstPct, 41).ok).toBe(false);
    expect(validateSetting("unknown.key", 1).ok).toBe(false);
    expect(validateSetting(featureKey("documents"), "yes").ok).toBe(false);
  });

  it("parses day lists and flags non-numbers", () => {
    expect(parseDayList("7, 3 1")).toEqual([7, 3, 1]);
    expect(parseDayList("7, x").some(Number.isNaN)).toBe(true);
  });

  it("requires amber below red", () => {
    expect(healthThresholdError(5, 15)).toBeNull();
    expect(healthThresholdError(15, 15)).not.toBeNull();
  });
});

describe("reorder logic", () => {
  const ids = ["a", "b", "c", "d"];
  it("moves up and down and clamps at the ends", () => {
    expect(moveItem(ids, "c", -1)).toEqual(["a", "c", "b", "d"]);
    expect(moveItem(ids, "a", -1)).toEqual(ids);
    expect(moveItem(ids, "d", 1)).toEqual(ids);
    expect(moveItem(ids, "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(ids, "zzz", 1)).toEqual(ids);
  });
  it("drags to an index without mutating the input", () => {
    expect(moveToIndex(ids, 0, 3)).toEqual(["b", "c", "d", "a"]);
    expect(ids).toEqual(["a", "b", "c", "d"]);
    expect(moveToIndex(ids, 1, 9)).toEqual(ids);
  });
  it("numbers sequences from 1 and detects stale orders", () => {
    expect(sequencesFor(["x", "y"])).toEqual([{ id: "x", sequence: 1 }, { id: "y", sequence: 2 }]);
    expect(isPermutation(ids, ["d", "c", "b", "a"])).toBe(true);
    expect(isPermutation(ids, ["a", "b", "c"])).toBe(false);
    expect(isPermutation(ids, ["a", "b", "c", "e"])).toBe(false);
  });
});

describe("GSTIN validation in the settings schema", () => {
  const base = { legalName: "S. Prince Hightech Pvt. Ltd.", stateId: "st1", address: "Mumbai office", isActive: true };
  const good = makeGstin("27", "AABCS1234F");
  it("accepts a GSTIN with a valid checksum and matching PAN", () => {
    expect(gstinSchema.safeParse({ ...base, gstin: good, panNumber: "AABCS1234F", isPlaceholder: false }).success).toBe(true);
  });
  it("rejects a wrong check character", () => {
    const bad = good.slice(0, 14) + (good[14] === "A" ? "B" : "A");
    const r = gstinSchema.safeParse({ ...base, gstin: bad, panNumber: "AABCS1234F", isPlaceholder: false });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["gstin"]);
  });
  it("rejects a PAN that differs from the one inside the GSTIN", () => {
    expect(gstinSchema.safeParse({ ...base, gstin: good, panNumber: "AABCS9999F", isPlaceholder: false }).success).toBe(false);
  });
  it("lets a placeholder skip the checksum but still needs 15 characters", () => {
    const placeholder = withValidCheckChar(good).slice(0, 14) + "0";
    expect(gstinSchema.safeParse({ ...base, gstin: placeholder, panNumber: "", isPlaceholder: true }).success).toBe(true);
    expect(gstinSchema.safeParse({ ...base, gstin: "27AAAAA", panNumber: "", isPlaceholder: true }).success).toBe(false);
  });
});

describe("statutory rate input", () => {
  const ok = { code: "pf_employer", label: "PF employer", unit: "PERCENT", value: 12, effectiveFrom: "2026-04-01", reason: "Notification" };
  it("normalises the code and needs a reason and a real date", () => {
    expect(statutoryRateSchema.parse(ok).code).toBe("PF_EMPLOYER");
    expect(statutoryRateSchema.safeParse({ ...ok, reason: "" }).success).toBe(false);
    expect(statutoryRateSchema.safeParse({ ...ok, effectiveFrom: "01-04-2026" }).success).toBe(false);
    expect(statutoryRateSchema.safeParse({ ...ok, value: -1 }).success).toBe(false);
  });
});

describe("rateOn picks the rate in force on a date", () => {
  type Row = { code: string; value: Prisma.Decimal; unit: string; effectiveFrom: Date; sourceNote: string | null; isActive: boolean; deletedAt: Date | null; category: string | null; regionId: string | null };
  const row = (value: number, from: string, extra: Partial<Row> = {}): Row => ({
    code: "PF_EMPLOYER", value: new Prisma.Decimal(value), unit: "PERCENT", effectiveFrom: new Date(`${from}T00:00:00Z`), sourceNote: null, isActive: true, deletedAt: null, category: null, regionId: null, ...extra,
  });
  const rows = [row(12, "2014-09-01"), row(13, "2026-04-01"), row(14, "2027-04-01"), row(99, "2026-06-01", { isActive: false }), row(15, "2026-04-01", { category: "skilled" })];
  const fakeDb = {
    setting: {},
    statutoryRate: {
      findMany: async (args: { where: { code: string; effectiveFrom: { lte: Date } } }) =>
        rows.filter((r) => r.code === args.where.code && r.isActive && r.effectiveFrom <= args.where.effectiveFrom.lte).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime()),
    },
  } as unknown as Parameters<typeof rateOn>[3];
  const at = (d: string, opts = {}) => rateOn("PF_EMPLOYER", new Date(`${d}T00:00:00Z`), opts, fakeDb);

  it("uses the latest row on or before the date and keeps history", async () => {
    expect(Number((await at("2020-01-01"))?.value)).toBe(12);
    expect(Number((await at("2026-04-01"))?.value)).toBe(13);
    expect(Number((await at("2026-12-31"))?.value)).toBe(13);
    expect(Number((await at("2027-04-01"))?.value)).toBe(14);
  });
  it("returns null before the first rate and ignores inactive rows", async () => {
    expect(await at("2010-01-01")).toBeNull();
    expect(Number((await at("2026-07-01"))?.value)).toBe(13);
  });
  it("prefers a category-specific row when asked for it", async () => {
    expect(Number((await at("2026-05-01", { category: "skilled" }))?.value)).toBe(15);
    expect(Number((await at("2026-05-01", { category: "unskilled" }))?.value)).toBe(13);
  });
});

describe("runtime settings drive behaviour", () => {
  const project = { healthOverride: null } as unknown as Project;

  it("defaults reproduce the previous hard-coded rules", () => {
    expect(DEFAULT_APP_SETTINGS.reminders.deadlineDays).toEqual([7, 3, 1]);
    expect(deadlineBands()).toEqual({ soon: 7, urgent: 3 });
    expect(computeHealth(project, 50, 56)).toBe("AMBER");
    expect(computeHealth(project, 50, 66)).toBe("RED");
    expect(computeHealth(project, 50, 54)).toBe("GREEN");
    expect(reminderBand(2)).toBe(3);
    expect(reminderBand(8)).toBeNull();
    expect(relativeDeadline("2026-10-12", "2026-10-08").tone).toBe("soon");
  });

  it("health thresholds follow the setting", () => {
    setAppSettings(resolveAppSettings({ [SETTING_KEYS.healthAmberDelayPct]: 10, [SETTING_KEYS.healthRedDelayPct]: 20 }));
    expect(computeHealth(project, 50, 56)).toBe("GREEN");
    expect(computeHealth(project, 50, 66)).toBe("AMBER");
    expect(computeHealth(project, 50, 75)).toBe("RED");
  });

  it("ignores an inconsistent amber/red pair", () => {
    const s = resolveAppSettings({ [SETTING_KEYS.healthAmberDelayPct]: 30, [SETTING_KEYS.healthRedDelayPct]: 10 });
    expect(s.health).toEqual({ amberDelayPct: 5, redDelayPct: 15 });
  });

  it("reminder days change the deadline bands and urgency", () => {
    setAppSettings(resolveAppSettings({ [SETTING_KEYS.deadlineDays]: [14, 5, 2] }));
    expect(deadlineBands()).toEqual({ soon: 14, urgent: 5 });
    expect(relativeDeadline("2026-10-12", "2026-10-08").tone).toBe("urgent");
    expect(relativeDeadline("2026-10-15", "2026-10-08").tone).toBe("soon");
    expect(reminderBand(10)).toBe(14);
    setAppSettings(resolveAppSettings({ [SETTING_KEYS.remindersEnabled]: false }));
    expect(reminderBand(1)).toBeNull();
  });

  it("feature toggles honour the env override only for finance, payroll and daily work", () => {
    const off = resolveAppSettings({ [featureKey("documents")]: false, [featureKey("payroll")]: false });
    expect(isFeatureOn("documents", null, off)).toBe(false);
    expect(isFeatureOn("documents", true, off)).toBe(false);
    expect(isFeatureOn("payroll", true, off)).toBe(true);
    expect(isFeatureOn("payroll", null, off)).toBe(false);
    expect(envOverride("true")).toBe(true);
    expect(envOverride("0")).toBe(false);
    expect(envOverride(undefined)).toBeNull();
  });
});
