import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["functions/src/**/*.test.ts", "app/src/**/*.test.ts", "app/src/**/*.test.tsx"],
    environment: "node",
  },
});
