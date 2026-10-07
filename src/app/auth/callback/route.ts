import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Supabase email links (password recovery) land here with ?code=; exchange it for a session, then continue. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  // Only same-site relative targets, never an open redirect.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const fail = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=link";
    return NextResponse.redirect(url);
  };
  if (!code) return fail();

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail();

  const url = request.nextUrl.clone();
  url.pathname = target;
  url.search = "";
  return NextResponse.redirect(url);
}
