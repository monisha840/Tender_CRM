import { describe, expect, it } from "vitest";
import { createRateLimiter, loginKey } from "../rate-limit";
import { resolveDevRoleSwitcher } from "../dev-flags";
import { isBarePath, isPublicPath } from "../public-paths";

describe("rate limiter", () => {
  it("blocks the 6th attempt inside the window and recovers after it", () => {
    let t = 0;
    const rl = createRateLimiter({ max: 5, windowMs: 15 * 60_000, now: () => t });
    for (let i = 0; i < 5; i++) {
      expect(rl.check("k").allowed).toBe(true);
      rl.fail("k");
    }
    const blocked = rl.check("k");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(900);
    t = 15 * 60_000 + 1;
    expect(rl.check("k").allowed).toBe(true);
    expect(rl.size()).toBe(0);
  });
  it("keys are independent and reset clears", () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000 });
    rl.fail("a");
    expect(rl.check("a").allowed).toBe(false);
    expect(rl.check("b").allowed).toBe(true);
    rl.reset("a");
    expect(rl.check("a").allowed).toBe(true);
  });
  it("normalises the email in the key", () => {
    expect(loginKey("1.1.1.1", " A@X.com ")).toBe("1.1.1.1|a@x.com");
  });
});

describe("dev role switcher flag", () => {
  it("is on only when flagged and APP_ENV is development or test", () => {
    expect(resolveDevRoleSwitcher("true", "development")).toBe(true);
    expect(resolveDevRoleSwitcher("true", "test")).toBe(true);
    expect(resolveDevRoleSwitcher("true", undefined)).toBe(false);
    expect(resolveDevRoleSwitcher("true", "production")).toBe(false);
    expect(resolveDevRoleSwitcher(undefined, "development")).toBe(false);
    expect(resolveDevRoleSwitcher("false", "development")).toBe(false);
  });
});

describe("public paths", () => {
  it("allows only auth screens", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/reset-password")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/login-evil")).toBe(false);
    expect(isBarePath("/change-password")).toBe(true);
    expect(isPublicPath("/change-password")).toBe(false);
  });
});
