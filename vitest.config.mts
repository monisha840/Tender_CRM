import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// Integration tests read DATABASE_URL / APP_ENV from .env.local (gitignored); absent file is fine (CI).
loadEnv({ path: ".env.local", quiet: true });

export default defineConfig({
  resolve: {
    // Mirrors tsconfig "paths": { "@/*": ["./src/*"] }
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside the react-server condition; stub it for unit/integration tests.
      "server-only": fileURLToPath(new URL("./tests/setup/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // DB integration tests share one dev database and some compare whole-table counts, so run test files one at a time.
    fileParallelism: false,
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["node_modules/**", "tests/e2e/**"],
    setupFiles: ["tests/setup/setup.ts"],
  },
});
