import type { Metadata } from "next";
import { AuthForm, AuthLink } from "@/components/auth/auth-form";
import { loginAction } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthForm
      title="Sign in"
      description="Use your S. Prince work email and password."
      action={loginAction}
      fields={[
        { name: "email", label: "Email", type: "email", autoComplete: "username" },
        { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
      ]}
      submitLabel="Sign in"
      pendingLabel="Signing in..."
      linkNotice="That link has expired or was already used. Request a new one."
      footer={<AuthLink href="/forgot-password">Forgot password?</AuthLink>}
    />
  );
}
