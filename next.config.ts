import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Keep the dev-only Next.js indicator from covering the sidebar's collapse button.
  devIndicators: { position: "bottom-right" },
  cacheComponents: true,
  // Mirror APP_ENV for client code (feature flags in src/lib/features.ts).
  // Always defined (even as "") so the bundler can fold the dev-only role switcher condition and drop its code.
  env: {
    NEXT_PUBLIC_APP_ENV: process.env.APP_ENV ?? "",
    NEXT_PUBLIC_DEV_ROLE_SWITCHER: process.env.NEXT_PUBLIC_DEV_ROLE_SWITCHER ?? "",
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
