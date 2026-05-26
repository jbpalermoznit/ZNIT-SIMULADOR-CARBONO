import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest configuration — covers pure server-side modules (no DOM, no JSX).
 *
 * Aliasing `@/` so the test files mirror the import style of the app code.
 * Globs limited to tests/** to keep the runner focused; Tier 2 (route
 * handlers needing a DB stub) can land in a separate config later.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    // Inject fake env vars BEFORE any module loads so eager Supabase client
    // construction in lib/server/* doesn't crash.
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: [
        "lib/server/cost-code-classifier.ts",
        "lib/server/calculator.ts",
        "lib/server/emission-mapper.ts",
      ],
      reporter: ["text", "html"],
    },
  },
});
