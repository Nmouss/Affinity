# Affinity experience (Terminal 2)

The judged Affinity flow: voice/text mission → transcript → Mission Brief → participants → judge shopper → four quick choices → first read → 3D mission table → before/after decision → contextual Leap check → paused substitution → approval.

It's a standalone Vite + React app, separate from the root Next.js MVP. It reads GLBs and demo art from the repo-root `public/` directory.

## Run

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (mock mode by default)
```

For judging, use a production build. The dev server can force-reload when it discovers a dependency:

```bash
npm run build && npx vite preview --port 5173
```

| URL / env | Effect |
|---|---|
| `?api=mock` (default) | Everything runs in-browser from `src/mocks`: no network, backend, mic, or Leap needed |
| `?api=http` or `VITE_AFFINITY_API=http` | Calls Terminal 1 at `VITE_AFFINITY_API_URL` (default `http://localhost:8000`) |
| `VITE_LEAP_WS_URL` | Leap v6 socket (default `ws://127.0.0.1:6437/v6.json`); `npm run leap:replay` at the repo root serves a recording |

Presenter shortcuts: **Shift+Esc** restarts from Home. On Home, "the preloaded cabin transcript" link is the one-button voice fallback.

## Structure

```text
src/state/machine.ts       The one state machine: SCREENS, TRANSITIONS, reducer, voice confirmation policy
src/state/controller.ts    Async actions; every engine call goes through the adapter
src/services/affinityApi.ts  AffinityApi interface + mode selection (mock | http)
src/services/mockApi.ts    In-memory fixtures (no scoring — selects fixed results)
src/services/httpApi.ts    Terminal 1 endpoints (bodies are assumptions until the contract freeze)
src/services/contracts.ts  LOCAL MOCK copy of shared types — replace with shared/types after freeze
src/mocks/                 mission, shoppers, products, recommendation, substitution fixtures
src/screens/               One file per stage of the story
src/three/                 Mission table (R3F), sprite labels, 2D fallback, WebGL detection
src/voice/                 Push-to-talk over the Web Speech API
src/leap/leapStore.ts      Shared Leap connection, swipe detection
../leap-bridge/            Frame parsing, bounded observation, recorded session
scripts/make-models.mjs    Regenerates public/models/*.glb (`npm run models`)
scripts/demo-smoke.mjs     Runs the full story in Chrome with external network blocked
```

## Test

```bash
npm test                          # tests/ui (Vitest + Testing Library, jsdom)
npm run typecheck
node scripts/demo-smoke.mjs       # with the dev/preview server running; screenshots → /tmp/affinity-shots
```
