import type { Metadata } from "next";
import { AuthForm, AuthLink } from "@/components/auth/auth-form";
import { forgotPasswordAction } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthForm
      title="Forgot password"
      description="Enter your email and we will send you a link to set a new password."
      action={forgotPasswordAction}
      fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
      submitLabel="Send reset link"
      pendingLabel="Sending..."
      footer={<AuthLink href="/login">Back to sign in</AuthLink>}
    />
  );
}
