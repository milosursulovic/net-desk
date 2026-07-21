import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    testTimeout: 15000,
    // Integration tests share one real external MySQL instance (see
    // tests/helpers/testDb.js) - running test files in parallel workers
    // risks races beyond just IP uniqueness (e.g. two files' cleanup
    // stepping on each other). The full suite runs in well under a second
    // sequentially, so there's no real cost to disabling parallelism.
    fileParallelism: false,
  },
});
