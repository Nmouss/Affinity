import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
// Mirror the `@/*` path alias from tsconfig.json so tests resolve the same imports as Next.
const resolve = { alias: [{ find: /^@\//, replacement: root }] };

export default defineConfig({
  resolve,
  test: {
    projects: [
      {
        resolve,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: ["tests/ui/**"],
        },
      },
      {
        // The mission app's UI tests render React in jsdom against the mock and real engines.
        resolve,
        esbuild: { jsx: "automatic" },
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["tests/ui/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/ui/setup.ts"],
          css: false,
          // Full journeys through jsdom and the real engine take several seconds each under load.
          testTimeout: 20000,
        },
      },
    ],
  },
});
