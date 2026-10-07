// Prints a Cookie header value for a signed-in Supabase user (for curl smoke tests). Never prints the password.
//   node -r dotenv/config scripts/smoke-cookie.mjs admin@sprince.example   (dotenv_config_path=.env.local)
const email = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.E2E_TEST_PASSWORD;
if (!email || !url || !anon || !password) throw new Error("usage: smoke-cookie.mjs <email>; needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, E2E_TEST_PASSWORD");
const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const session = await res.json();
if (!res.ok) throw new Error(`login failed: ${session.error_description ?? session.msg ?? res.status}`);
const ref = new URL(url).hostname.split(".")[0];
const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
// @supabase/ssr chunks cookies above ~3180 chars; emit chunks the same way.
const MAX = 3180;
const parts = [];
for (let i = 0; i * MAX < value.length; i++) parts.push(`sb-${ref}-auth-token.${i}=${value.slice(i * MAX, (i + 1) * MAX)}`);
process.stdout.write(value.length <= MAX ? `sb-${ref}-auth-token=${value}` : parts.join("; "));
