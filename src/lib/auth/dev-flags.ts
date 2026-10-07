/**
 * Dev-only role switcher. Needs NEXT_PUBLIC_DEV_ROLE_SWITCHER=true AND APP_ENV not "production".
 * Both are inlined at build time (APP_ENV is mirrored to NEXT_PUBLIC_APP_ENV in next.config.ts),
 * so a production build with either unset/production contains no switcher.
 */
export function resolveDevRoleSwitcher(flag: string | undefined, appEnv: string | undefined): boolean {
  return flag?.trim().toLowerCase() === "true" && appEnv?.trim().toLowerCase() !== "production";
}

export const DEV_ROLE_SWITCHER: boolean = resolveDevRoleSwitcher(
  process.env.NEXT_PUBLIC_DEV_ROLE_SWITCHER,
  process.env.NEXT_PUBLIC_APP_ENV || process.env.APP_ENV,
);
