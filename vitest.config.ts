import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = {
  "@": path.resolve(__dirname, "src"),
  // `server-only` throws outside Next's react-server condition; stub it for tests.
  "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/setup.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/setup.ts"],
          // Integration files share one Postgres database; never run them concurrently.
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
