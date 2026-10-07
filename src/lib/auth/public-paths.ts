/** Routes reachable without a session. Everything else requires login. */
export const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/auth/callback", "/auth/signout"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Pages rendered without the app shell (no sidebar/header). /change-password needs a session but is shell-less. */
export function isBarePath(pathname: string): boolean {
  return isPublicPath(pathname) || pathname === "/change-password";
}
