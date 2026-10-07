import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// Integration tests read DATABASE_URL / APP_ENV from .env.local (gitignored); absent file is fine (CI).
loadEnv({ path: ".env.local", quiet: true });

export default defineConfig({
  resolve: {
    // Mirrors tsconfig "paths": { "@/*": ["./src/*"] }
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["tests/setup/setup.ts"],
  },
});
