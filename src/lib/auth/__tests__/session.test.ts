import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, findUnique } = vi.hoisted(() => ({ getUser: vi.fn(), findUnique: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("@/lib/server/prisma", () => ({ prisma: { user: { findUnique } } }));

import { AuthError } from "@/lib/server/auth-types";
import { getSessionUser, mapSessionContext, requireUser, requireUserForAction, type SessionUserRow } from "../session";

const role = (key: string, over = {}) => ({ role: { key, name: key, homePath: "/dashboard", isActive: true, deletedAt: null, ...over } });
const row = (over: Partial<SessionUserRow> = {}): SessionUserRow => ({
  id: "u1",
  authUserId: "a1",
  email: "d@x.test",
  name: "Dee",
  isActive: true,
  deletedAt: null,
  mustChangePassword: false,
  roles: [role("director")],
  ...over,
});

describe("mapSessionContext", () => {
  it("maps a user and role keys", () => {
    const ctx = mapSessionContext({ id: "a1" }, row({ roles: [role("director"), role("system_admin")] }));
    expect(ctx?.user).toEqual({ id: "u1", authUserId: "a1", email: "d@x.test", name: "Dee", roleKeys: ["director", "system_admin"] });
    expect(ctx?.homePath).toBe("/dashboard");
  });
  it("returns null for missing, inactive, deleted, mismatched or role-less users", () => {
    expect(mapSessionContext({ id: "a1" }, null)).toBeNull();
    expect(mapSessionContext({ id: "a1" }, row({ isActive: false }))).toBeNull();
    expect(mapSessionContext({ id: "a1" }, row({ deletedAt: new Date() }))).toBeNull();
    expect(mapSessionContext({ id: "other" }, row())).toBeNull();
    expect(mapSessionContext({ id: "a1" }, row({ roles: [] }))).toBeNull();
  });
  it("ignores inactive or deleted roles", () => {
    expect(mapSessionContext({ id: "a1" }, row({ roles: [role("director", { isActive: false }), role("x", { deletedAt: new Date() })] }))).toBeNull();
  });
});

describe("session lookups", () => {
  beforeEach(() => {
    getUser.mockReset();
    findUnique.mockReset();
  });

  it("returns null without a verified Supabase user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("no") });
    expect(await getSessionUser()).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("requireUser redirects to /login; requireUserForAction throws UNAUTHENTICATED", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
    await expect(requireUserForAction()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(requireUserForAction()).rejects.toBeInstanceOf(AuthError);
  });
});
