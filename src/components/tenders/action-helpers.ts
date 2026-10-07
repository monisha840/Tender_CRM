"use client";

import { useAuthUser } from "@/components/auth/session-provider";

/** Minimal structural copy of the server's ActionResult (importing the server module into client code is not allowed). */
export type ClientActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } };

/** One readable line for a failed server action (field errors are joined; FORBIDDEN gets a plain sentence). */
export function errorText(res: Extract<ClientActionResult, { ok: false }>): string {
  const { code, message, fieldErrors } = res.error;
  if (code === "FORBIDDEN") return "Your role is not allowed to do this.";
  if (code === "SELF_APPROVAL") return "You cannot decide a request you submitted.";
  if (code === "UNAUTHENTICATED") return "Your session has expired. Sign in again.";
  const fields = fieldErrors ? Object.values(fieldErrors).flat() : [];
  return fields.length > 0 ? fields.join(" ") : message;
}

/**
 * What the buttons should offer. UI hiding only: the server re-checks every action (`runAction` -> `assertCan`).
 * Without a signed-in user (local dev with no auth) everything is shown so the server answers instead.
 */
export function useTenderRoles() {
  const user = useAuthUser();
  const keys = user?.roleKeys ?? null;
  return {
    /** Enters data and submits requests (System Admin). */
    canWrite: keys === null || keys.includes("system_admin"),
    /** Decides approvals (Director). */
    canDecide: keys === null || keys.includes("director"),
    userId: user?.id ?? null,
  };
}

/** Value for <input type="datetime-local"> in IST from a UTC timestamp. */
export function toIstLocalInput(iso: string): string {
  return new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 16);
}
