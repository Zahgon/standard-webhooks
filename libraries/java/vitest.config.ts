import { defineConfig } from "vitest/config";

// Unit suite. Mirrors the original's surefire configuration, which excludes
// **/*IntegrationTest.java from the test phase and runs it separately against
// the packaged artifact.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
