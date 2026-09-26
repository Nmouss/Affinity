# Affinity experience (Terminal 2)

The judged Affinity flow: voice/text mission → transcript → Mission Brief → participants → judge shopper → four quick choices → first read → 3D mission table → before/after decision → contextual Leap check → paused substitution → approval.

It's a standalone Vite + React app, separate from the root Next.js MVP. It reads GLBs and demo art from the repo-root `public/` directory.

## Run

```bash
cd frontend
npm install
npm run dev            # http://localhost:5180 (Terminal 1 engine in the page by default)
```

For judging, use a production build. The dev server can force-reload when it discovers a dependency:

```bash
npm run build && npx vite preview --port 5180
```

| URL / env | Effect |
|---|---|
| `?api=core` (default) | Terminal 1's `AffinityCoreService` runs in the page: real engine, no network or server |
| `?api=mock` | Offline fixtures from `src/mocks` (the brief's full five-category story) |
| `?api=http` | Terminal 1's endpoints at `VITE_AFFINITY_API_URL` (default `/api/core`, mounted by the dev server over the same service) |
| `VITE_LEAP_WS_URL` | Leap v6 socket (default `ws://127.0.0.1:6437/v6.json`); `npm run leap:replay` at the repo root serves a recording |

Presenter shortcuts: **Shift+Esc** restarts from Home. On Home, "the preloaded cabin transcript" link is the one-button voice fallback.

## Structure

```text
src/state/machine.ts       The one state machine: SCREENS, TRANSITIONS, reducer, voice confirmation policy
src/state/controller.ts    Async actions; every engine call goes through the adapter
src/services/affinityApi.ts  AffinityApi interface + mode selection (mock | http)
src/services/mockApi.ts    In-memory fixtures (no scoring — selects fixed results)
src/services/engineApi.ts  AffinityApi over Terminal 1's engine (in-page or HTTP transport)
src/services/contracts.ts  Aliases of the frozen @/shared/types plus UI-side adapter shapes
src/mocks/                 mission, shoppers, products, recommendation, substitution fixtures
src/screens/               One file per stage of the story
src/three/                 Mission table (R3F), sprite labels, 2D fallback, WebGL detection
src/voice/                 Push-to-talk over the Web Speech API
src/leap/leapStore.ts      Shared Leap connection, swipe detection
../leap-bridge/            Frame parsing, bounded observation, recorded session
scripts/make-models.mjs    Regenerates public/models/*.glb (`npm run models`)
scripts/demo-smoke.mjs     Runs the full story in Chrome with external network blocked (AFFINITY_URL=…?api=core|mock|http)
scripts/keyboard-smoke.mjs Completes the story with the keyboard only
scripts/make-engine-images.mjs  Renders the PNGs Terminal 1's products.json references
```

## Test

```bash
npm test                          # tests/ui (Vitest + Testing Library, jsdom)
npm run typecheck
node scripts/demo-smoke.mjs       # with the dev/preview server running; screenshots → /tmp/affinity-shots
```
