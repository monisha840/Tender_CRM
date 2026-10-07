import path from "node:path";

/** Saved login state per role, written by tests/e2e/auth.setup.ts. */
export const AUTH = {
  admin: path.join(__dirname, "..", ".auth", "admin.json"),
  director: path.join(__dirname, "..", ".auth", "director.json"),
};
