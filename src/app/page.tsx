import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";

/** No landing page: send each visitor by auth state (login, forced password change, or their role's home). */
export default async function RootPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (ctx.mustChangePassword) redirect("/change-password");
  redirect(ctx.homePath);
}
