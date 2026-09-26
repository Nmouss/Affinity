/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const modules = path.resolve(here, "node_modules");

// Tests in tests/ui and modules in leap-bridge live outside this package, so bare imports from those
// files must resolve to this package's node_modules (the repo root has its own React for the Next app).
const shared = ["react", "react-dom", "three", "@react-three/fiber", "@react-three/drei", "@testing-library/react", "@testing-library/user-event", "@testing-library/jest-dom", "vitest"];

export default defineConfig({
  plugins: [react()],
  publicDir: path.resolve(repoRoot, "public"),
  resolve: {
    dedupe: ["react", "react-dom", "three"],
    alias: shared.map((name) => ({ find: new RegExp(`^${name.replace("/", "\\/")}(?=/|$)`), replacement: path.join(modules, name) })),
  },
  server: { port: 5173, fs: { allow: [repoRoot] } },
  // Pre-bundle everything up front so the dev server never force-reloads mid-demo.
  optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "three", "@react-three/fiber", "@react-three/drei"] },
  test: {
    root: repoRoot,
    include: ["tests/ui/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: [path.resolve(repoRoot, "tests/ui/setup.ts")],
    css: false,
  },
});
