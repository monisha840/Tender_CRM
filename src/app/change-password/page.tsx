import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { changePasswordAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Change password" };

/** First login: the account was created with a temporary password, so a new one is required before continuing. */
export default async function ChangePasswordPage() {
  await requireUser();
  return (
    <AuthForm
      title="Choose your password"
      description="You are signing in for the first time. Set a personal password to continue."
      action={changePasswordAction}
      fields={[
        { name: "password", label: "New password", type: "password", autoComplete: "new-password", hint: "At least 10 characters." },
        { name: "confirm", label: "Confirm new password", type: "password", autoComplete: "new-password" },
      ]}
      submitLabel="Save and continue"
      pendingLabel="Saving..."
    />
  );
}
