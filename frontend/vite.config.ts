/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const modules = path.resolve(here, "node_modules");

// Tests in tests/ui and modules in leap-bridge live outside this package, so bare imports from those
// files must resolve to this package's node_modules (the repo root has its own React for the Next app).
const shared = ["react", "react-dom", "three", "@react-three/fiber", "@react-three/drei", "@testing-library/react", "@testing-library/user-event", "@testing-library/jest-dom", "vitest", "zod"];

/**
 * Thin HTTP adapter over Terminal 1's transport-neutral AffinityCoreService, mounted at /api/core on
 * the dev server (Terminal 1's API.md asks Terminal 2 to own this layer). Routes follow
 * shared/contracts/api.ts; errors map to 400 / 404 / 409 as API.md specifies.
 */
function affinityCoreHttp(): Plugin {
  type Service = Record<string, (...args: unknown[]) => unknown>;
  let service: Service | null = null;
  const routes: [string, RegExp, (s: Service, m: string[], body: any) => unknown][] = [
    ["POST", /^\/missions\/parse$/, (s, _m, b) => s.parseMission(b)],
    ["POST", /^\/missions$/, (s, _m, b) => s.createMission(b)],
    ["GET", /^\/missions\/([^/]+)$/, (s, m) => s.getMission(m[1])],
    ["POST", /^\/missions\/([^/]+)\/(?:participants|shoppers)$/, (s, m, b) => s.addParticipant(m[1], b)],
    ["POST", /^\/missions\/([^/]+)\/recommend$/, (s, m, b) => s.recommend(m[1], b)],
    ["POST", /^\/missions\/([^/]+)\/substitutions\/evaluate$/, (s, m, b) => s.evaluateSubstitution(m[1], b)],
    ["POST", /^\/shoppers$/, (s, _m, b) => s.createShopper(b)],
    ["POST", /^\/shoppers\/([^/]+)\/rules$/, (s, m, b) => s.addShopperRule(m[1], b)],
    ["POST", /^\/shoppers\/([^/]+)\/comparisons$/, (s, m, b) => s.applyShopperComparison(m[1], b)],
    ["POST", /^\/shoppers\/([^/]+)\/use-observations$/, (s, m, b) => s.recordShopperUseObservation(m[1], b)],
    ["POST", /^\/shoppers\/([^/]+)\/(?:confirm|use-requirements)$/, (s, m, b) => s.confirmShopperUseObservation(m[1], b)],
    ["POST", /^\/shoppers\/([^/]+)\/events$/, (s, m, b) => s.acceptShopperEvent(m[1], b)],
    ["POST", /^\/voice\/interpret$/, (s, _m, b) => s.interpretVoice(b)],
  ];
  const status = (message: string) => (/^Unknown /.test(message) ? 404 : /eligible|conflict|pending|does not match/i.test(message) ? 409 : 400);
  return {
    name: "affinity-core-http",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/core", async (req, res) => {
        const send = (code: number, payload: unknown) => {
          res.statusCode = code;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(payload));
        };
        try {
          if (!service) {
            const mod = await server.ssrLoadModule(path.resolve(repoRoot, "backend/service.ts"));
            service = new mod.AffinityCoreService() as Service;
          }
          const url = (req.url ?? "/").split("?")[0];
          const route = routes.find(([method, pattern]) => method === req.method && pattern.test(url));
          if (!route) return send(404, { error: `No route for ${req.method} ${url}` });
          let raw = "";
          for await (const chunk of req) raw += chunk;
          const params = url.match(route[1])!.map(decodeURIComponent);
          send(200, await route[2](service, params, raw ? JSON.parse(raw) : {}));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send(status(message), { error: message });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), affinityCoreHttp()],
  publicDir: path.resolve(repoRoot, "public"),
  resolve: {
    dedupe: ["react", "react-dom", "three"],
    alias: [
      // Terminal 1's frozen contracts and engine import each other through the repo-wide `@/` alias.
      { find: /^@\//, replacement: `${repoRoot}/` },
      ...shared.map((name) => ({ find: new RegExp(`^${name.replace("/", "\\/")}(?=/|$)`), replacement: path.join(modules, name) })),
    ],
  },
  server: { port: 5180, fs: { allow: [repoRoot] } },
  // Pre-bundle everything up front so the dev server never force-reloads mid-demo.
  optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "three", "@react-three/fiber", "@react-three/drei"] },
  test: {
    root: repoRoot,
    include: ["tests/ui/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: [path.resolve(repoRoot, "tests/ui/setup.ts")],
    css: false,
    // Full journeys through jsdom and the real engine take several seconds each under load.
    testTimeout: 20000,
  },
});
