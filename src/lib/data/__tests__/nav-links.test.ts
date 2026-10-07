import { describe, expect, it } from "vitest";
import { DASHBOARD_AGEING, decodeRouteId, entityHref } from "../links";

describe("entityHref (B22)", () => {
  it("opens a project's own detail page", () => {
    expect(entityHref("PROJECT", "prj_new 1")).toBe("/projects/prj_new%201");
  });
  it("sends purchase records to the approvals inbox, not daily work", () => {
    expect(entityHref("PURCHASE_REQUEST", "pr1")).toBe("/approvals");
    expect(entityHref("PURCHASE_ORDER")).toBe("/approvals");
  });
  it("falls back to the dashboard for unknown types", () => {
    expect(entityHref("NOPE", "x")).toBe("/dashboard");
  });
});

describe("decodeRouteId (B22)", () => {
  it("decodes percent-encoded ids", () => expect(decodeRouteId("tnd%2F12%20A")).toBe("tnd/12 A"));
  it("returns a malformed segment unchanged instead of throwing", () => expect(decodeRouteId("%E0%A4%A")).toBe("%E0%A4%A"));
});

describe("DASHBOARD_AGEING (B8)", () => {
  const band = (days: number) => DASHBOARD_AGEING.find((b) => b.test(days))?.label;
  it("buckets days past due like the dashboard chart", () => {
    expect([0, 1, 30, 31, 60, 61].map(band)).toEqual(["Not yet due", "1–30 days", "1–30 days", "31–60 days", "31–60 days", "Over 60 days"]);
  });
});
