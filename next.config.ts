import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Keep the dev-only Next.js indicator from covering the sidebar's collapse button.
  devIndicators: { position: "bottom-right" },
  cacheComponents: true,
  // Mirror APP_ENV for client code (feature flags in src/lib/features.ts).
  env: { NEXT_PUBLIC_APP_ENV: process.env.APP_ENV ?? "" },
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
