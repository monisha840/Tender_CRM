// Server-only: never import from client components.
import type { Prisma, PermissionAction } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/server/prisma";
import { AuthError, type SessionUser } from "@/lib/server/auth-types";
import { assertCan } from "@/lib/server/permissions";
import { invalidateServerDb } from "@/lib/server/invalidate";
import { requireReason, writeAudit, type AuditInput, type Tx } from "@/lib/server/audit";

/**
 * The service pattern (see CLAUDE.md "Service pattern"):
 *   server action -> runAction: user -> zod parse -> assertCan -> $transaction(handler) -> typed result.
 * The handler does the writes and records them with `ctx.audit(...)`, all inside the same transaction.
 */

// ---------------------------------------------------------------------------
// Results and errors
// ---------------------------------------------------------------------------

export type ActionErrorCode = AuthError["code"] | "VALIDATION" | "CONFLICT" | "NOT_FOUND" | "INTERNAL";
export type ActionError = { code: ActionErrorCode; message: string; fieldErrors?: Record<string, string[]> };
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

/** Business-rule failures a handler wants to report to the user (not-found, bad state). */
export class ServiceError extends Error {
  constructor(public code: "NOT_FOUND" | "CONFLICT" | "VALIDATION", message: string) {
    super(message);
  }
}

/** Thrown by `updateWithVersion` when someone else changed the row first. */
export class VersionConflictError extends ServiceError {
  constructor(message = "This record was changed by someone else. Reload and try again.") {
    super("CONFLICT", message);
  }
}

// ---------------------------------------------------------------------------
// Current-user resolution
// ---------------------------------------------------------------------------

export type UserResolver = () => Promise<SessionUser>;

/** Default resolver: the real Supabase session (lazy import keeps unit tests free of next/headers). */
let defaultResolver: UserResolver = async () => {
  const { requireUserForAction } = await import("@/lib/auth/session");
  return requireUserForAction();
};
export function setUserResolver(fn: UserResolver) {
  defaultResolver = fn;
}

// ---------------------------------------------------------------------------
// runAction
// ---------------------------------------------------------------------------

export type ActionContext<I> = {
  tx: Tx;
  user: SessionUser;
  input: I;
  /** Append an audit row inside this transaction (user is filled in). The reason defaults to `input.reason`. */
  audit: (e: Omit<AuditInput, "user">) => Promise<void>;
};

export type ActionOptions<I> = {
  schema: z.ZodType<I>;
  module: string;
  /** Static permission action, or derived from the validated input (e.g. APPROVE vs REJECT). */
  action: PermissionAction | ((input: I) => PermissionAction);
  /** Input must carry a non-empty `reason` string. */
  reasonRequired?: boolean;
  /** Override the user lookup (tests, or before the session layer is wired). */
  getUser?: UserResolver;
  /** Transaction timeout, ms. */
  timeoutMs?: number;
};

function toActionError(e: unknown): ActionError {
  if (e instanceof AuthError) return { code: e.code, message: e.message };
  if (e instanceof z.ZodError) {
    return { code: "VALIDATION", message: "Please check the highlighted fields.", fieldErrors: z.flattenError(e).fieldErrors as Record<string, string[]> };
  }
  if (e instanceof ServiceError) return { code: e.code, message: e.message };
  console.error("[runAction] unexpected error", e);
  return { code: "INTERNAL", message: "Something went wrong. Please try again." };
}

/**
 * Builds a server action. Every business write goes through here so that validation, the permission check, the
 * transaction and the audit entry cannot be forgotten. A non-VIEW action whose handler wrote no audit entry fails
 * (and rolls back), so "every write creates an audit row" is enforced, not just intended.
 */
export function runAction<I, O>(opts: ActionOptions<I>, handler: (ctx: ActionContext<I>) => Promise<O>) {
  return async (rawInput: unknown): Promise<ActionResult<O>> => {
    try {
      const user = await (opts.getUser ?? defaultResolver)();
      const input = opts.schema.parse(rawInput);
      const action = typeof opts.action === "function" ? opts.action(input) : opts.action;
      await assertCan(user, opts.module, action);
      const inputReason = (input as { reason?: unknown } | null)?.reason;
      if (opts.reasonRequired) requireReason(typeof inputReason === "string" ? inputReason : null, `${opts.module}:${action}`);

      const data = await prisma.$transaction(
        async (tx) => {
          let audits = 0;
          const out = await handler({
            tx,
            user,
            input,
            audit: async (e) => {
              audits += 1;
              await writeAudit(tx, { reason: typeof inputReason === "string" ? inputReason : null, ...e, user });
            },
          });
          if (action !== "VIEW" && audits === 0) throw new Error(`${opts.module}:${action} wrote no audit entry`);
          return out;
        },
        { timeout: opts.timeoutMs ?? 15000 },
      );
      // Expire the cached server snapshot so the next render reads this write (no-op outside a Next request).
      if (action !== "VIEW") invalidateServerDb();
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: toActionError(e) };
    }
  };
}

// ---------------------------------------------------------------------------
// Optimistic locking (every business table has `version Int @default(1)`)
// ---------------------------------------------------------------------------

type VersionedDelegate = {
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<Prisma.BatchPayload>;
};

/**
 * Updates a row only if its `version` still equals what the user loaded, and bumps the version.
 * Throws VersionConflictError otherwise (also when the row is soft-deleted or missing).
 * Usage: `await updateWithVersion(tx.tender, id, input.version, { title })`
 */
export async function updateWithVersion(delegate: unknown, id: string, expectedVersion: number, data: Record<string, unknown>): Promise<void> {
  const res = await (delegate as VersionedDelegate).updateMany({
    where: { id, version: expectedVersion, deletedAt: null },
    data: { ...data, version: { increment: 1 } },
  });
  if (res.count !== 1) throw new VersionConflictError();
}
