import { describe, expect, it } from "vitest";
import { DEMO_TODAY, nowIso, setAsOfDate, toIstDate } from "@/lib/dates";
import { withUrlParam } from "@/lib/use-url-param";

describe("nowIso (B26)", () => {
  it("uses the demo day, not the real one", () => expect(toIstDate(nowIso())).toBe(DEMO_TODAY));
  it("follows the as-of date", () => {
    setAsOfDate("2026-09-01");
    expect(toIstDate(nowIso())).toBe("2026-09-01");
  });
});

describe("withUrlParam (B21)", () => {
  it("sets, replaces and removes a parameter, keeping the others", () => {
    expect(withUrlParam("", "stage", "s1")).toBe("?stage=s1");
    expect(withUrlParam("?stage=s1&q=a", "stage", "s2")).toBe("?stage=s2&q=a");
    expect(withUrlParam("?stage=s1&q=a", "stage", null)).toBe("?q=a");
    expect(withUrlParam("?stage=s1", "stage", "")).toBe("");
  });
  it("encodes values", () => expect(withUrlParam("", "q", "a b&c")).toBe("?q=a+b%26c"));
});
