import { describe, expect, it } from "vitest";
import { isModuleEnabled, PHASE67_ENABLED, resolvePhase67 } from "../features";
import { NAV_MODULES } from "../nav";

describe("PHASE67 feature flag", () => {
  it("defaults off in production and on elsewhere", () => {
    expect(resolvePhase67(undefined, "production")).toBe(false);
    expect(resolvePhase67("", "production")).toBe(false);
    expect(resolvePhase67(undefined, "development")).toBe(true);
    expect(resolvePhase67(undefined, undefined)).toBe(true);
  });
  it("an explicit value wins in either direction", () => {
    expect(resolvePhase67("true", "production")).toBe(true);
    expect(resolvePhase67("1", "production")).toBe(true);
    expect(resolvePhase67("false", "development")).toBe(false);
    expect(resolvePhase67("FALSE", undefined)).toBe(false);
  });
  it("is on under the test environment by default", () => {
    expect(PHASE67_ENABLED).toBe(true);
  });
  it("hides only employees and finance when disabled", () => {
    const hidden = NAV_MODULES.filter((m) => !isModuleEnabled(m.key, false)).map((m) => m.key);
    expect(hidden.sort()).toEqual(["employees", "finance"]);
    expect(NAV_MODULES.every((m) => isModuleEnabled(m.key, true))).toBe(true);
  });
});
