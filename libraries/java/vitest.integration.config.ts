import { defineConfig } from "vitest/config";

// Integration suite. Runs only after `tsc` has emitted dist/, and exercises the
// built artifact rather than the source tree.
export default defineConfig({
  test: {
    include: ["test/**/*.integration.test.ts"],
  },
});
