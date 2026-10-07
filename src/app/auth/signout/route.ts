import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Clears the Supabase session and sends the visitor to /login. Used when a session exists but the CRM profile is
 * missing/inactive (so the proxy's "signed in, leave /login" rule cannot bounce them back in a loop).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}
