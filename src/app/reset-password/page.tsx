import type { Metadata } from "next";
import { AuthForm, AuthLink } from "@/components/auth/auth-form";
import { resetPasswordAction } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Set a new password" };

/** Reached from the emailed link via /auth/callback, which has already established a recovery session. */
export default function ResetPasswordPage() {
  return (
    <AuthForm
      title="Set a new password"
      description="Choose a password you have not used before."
      action={resetPasswordAction}
      fields={[
        { name: "password", label: "New password", type: "password", autoComplete: "new-password", hint: "At least 10 characters." },
        { name: "confirm", label: "Confirm new password", type: "password", autoComplete: "new-password" },
      ]}
      submitLabel="Update password"
      pendingLabel="Updating..."
      footer={<AuthLink href="/login">Back to sign in</AuthLink>}
    />
  );
}
