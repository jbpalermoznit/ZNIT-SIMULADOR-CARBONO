import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest configuration — two projects sharing one runner:
 *
 *  - "server": pure server-side modules + route handlers (no DOM). Runs in
 *    the `node` environment. Matches the .test.ts files.
 *  - "dom": React component tests (Testing Library + jsdom). Matches the
 *    .test.tsx files. Kept in a separate project because importing
 *    @testing-library/react in a node env (no `document`) throws at load.
 *
 * Aliasing `@/` so the test files mirror the import style of the app code.
 */
const alias = { "@": path.resolve(__dirname, ".") };

export default defineConfig({
  resolve: { alias },
  test: {
    coverage: {
      provider: "v8",
      include: [
        "lib/server/cost-code-classifier.ts",
        "lib/server/calculator.ts",
        "lib/server/emission-mapper.ts",
      ],
      reporter: ["text", "html"],
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "server",
          include: ["tests/**/*.test.ts"],
          environment: "node",
          globals: false,
          // Inject fake env vars BEFORE any module loads so eager Supabase
          // client construction in lib/server/* doesn't crash.
          setupFiles: ["tests/setup.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "dom",
          include: ["tests/**/*.test.tsx"],
          environment: "jsdom",
          globals: false,
          setupFiles: ["tests/setup.ts", "tests/setup-dom.ts"],
        },
      },
    ],
  },
});
