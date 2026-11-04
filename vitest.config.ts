import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // Cloudflare calisma zamani yerine test taklidi (Node ortami).
      "cloudflare:workers": fileURLToPath(
        new URL("./functions/src/test-support/cloudflare-workers-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["functions/src/**/*.test.ts", "app/src/**/*.test.ts", "app/src/**/*.test.tsx"],
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    environmentMatchGlobs: [["app/src/**/*.test.tsx", "jsdom"]],
    server: {
      deps: {
        external: [/^node:/],
      },
    },
  },
  ssr: {
    external: ["node:sqlite"],
  },
});
