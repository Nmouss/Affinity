import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  // Mirror the `@/*` path alias from tsconfig.json so tests resolve the same imports as Next.
  resolve: { alias: [{ find: /^@\//, replacement: root }] },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
