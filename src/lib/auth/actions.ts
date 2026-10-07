"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/server/prisma";
import { createRateLimiter, loginKey, loginLimiter } from "@/lib/auth/rate-limit";
import { getSessionContext, loadSessionContext } from "@/lib/auth/session";

export type AuthFormState = { error?: string; message?: string };

const MIN_PASSWORD = 10;
const GENERIC_LOGIN_ERROR = "Invalid email or password.";
const resetLimiter = createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  if (!isEmail(email)) return { error: "Enter a valid email address." };

  const key = loginKey(await clientIp(), email);
  const gate = loginLimiter.check(key);
  if (!gate.allowed) {
    return { error: `Too many attempts. Try again in ${Math.ceil(gate.retryAfterSec / 60)} minute(s).` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    loginLimiter.fail(key);
    return { error: GENERIC_LOGIN_ERROR };
  }

  // A valid Supabase login is not enough: the user must have an active CRM profile with a role.
  const ctx = await loadSessionContext(data.user);
  if (!ctx) {
    await supabase.auth.signOut();
    loginLimiter.fail(key);
    return { error: "This account is not active. Contact your administrator." };
  }

  loginLimiter.reset(key);
  redirect(ctx.mustChangePassword ? "/change-password" : "/");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isEmail(email)) return { error: "Enter a valid email address." };

  const key = loginKey(await clientIp(), email);
  if (!resetLimiter.check(key).allowed) return { error: "Too many requests. Try again later." };
  resetLimiter.fail(key);

  const supabase = await createClient();
  // Result is deliberately ignored so the response never reveals whether an account exists.
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await origin()}/auth/callback?next=/reset-password` });
  return { message: "If an account exists for that email, a reset link has been sent." };
}

async function setPassword(password: string, confirm: string): Promise<AuthFormState | null> {
  const problem = passwordProblem(password, confirm);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Your session has expired. Request a new reset link." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message || "Could not update the password." };

  // Clear the forced-change flag. TODO(S2 audit layer): also write an audit entry once src/lib/server/audit lands.
  await prisma.$transaction([
    prisma.user.updateMany({ where: { authUserId: auth.user.id, deletedAt: null }, data: { mustChangePassword: false } }),
  ]);
  return null;
}

/** Recovery link flow: the callback route has already exchanged the code for a session. */
export async function resetPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const failed = await setPassword(String(formData.get("password") ?? ""), String(formData.get("confirm") ?? ""));
  if (failed) return failed;
  redirect("/");
}

/** First login (User.mustChangePassword). */
export async function changePasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const failed = await setPassword(String(formData.get("password") ?? ""), String(formData.get("confirm") ?? ""));
  if (failed) return failed;
  redirect(ctx.homePath || "/");
}
