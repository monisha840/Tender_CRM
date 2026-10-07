import { describe, expect, it } from "vitest";
import { matchDbUserId } from "../persona-map";

const db = { users: [{ id: "u-admin", email: "Admin@sprince.example" }, { id: "u-dir", email: "director@sprince.example" }] } as never;

describe("matchDbUserId (real session user -> db.users row)", () => {
  it("matches by id first", () => {
    expect(matchDbUserId(db, { id: "u-dir", email: "other@x.c" })).toBe("u-dir");
  });
  it("falls back to a case-insensitive e-mail match", () => {
    expect(matchDbUserId(db, { id: "unknown", email: " ADMIN@sprince.example " })).toBe("u-admin");
    expect(matchDbUserId(db, { email: "director@sprince.example" })).toBe("u-dir");
  });
  it("returns null instead of guessing a stand-in persona", () => {
    expect(matchDbUserId(db, { id: "nope", email: "nobody@x.c" })).toBeNull();
  });
});
