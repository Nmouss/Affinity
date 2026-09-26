# Affinity

HackGT 13 MVP for family-centered, agent-assisted shopping. Each family member is represented by a sprite agent; invited sprites form a council, resolve hard constraints versus wishes, score a catalog-backed bundle, and wait for a human-signed approval.

## Project layout

```text
app/                    Next.js App Router pages and API route handlers
components/             3D stage and demo UI, grouped by feature
data/                   Local family, catalog, and deterministic demo data
lib/agents/             LangGraph council graph, nodes, prompts, and schemas
lib/catalog/            Deterministic catalog search and hard-rule filtering
lib/gestures/           Leap/WebSocket adapter and gesture state machine
lib/crypto/             Browser mandate signing and server verification
lib/demo/               Fixed-seed playback and one-key reset helpers
public/                  GLB models and sprite/icon assets
types/                   Shared domain and event contracts
tests/                   Unit and end-to-end council-flow tests
backend/                 Deterministic group-shopping engine (AffinityCoreService) and API.md
shared/                  Engine contracts, types, and curated demo data
leap-bridge/             Leap frame parsing, bounded observation, recorded session
components/mission/      Group-shopping mission flow UI; its 3D scene is the Hearth living room
lib/mission/             Mission state machine, engine/mock adapters, and offline fixtures
scripts/mission/         Browser smoke tests and product-model/image generators
```

Pages: `/` is the family council stage, `/create` is the People Maker and plaza, and `/mission` is the
group-shopping flow. The mission room reuses the living room, and shoppers whose names match people
saved in the People Maker appear with their saved look.

## Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The local URL is intentional because the Leap tracking WebSocket does not provide secure WebSockets.

The mission flow is at `http://localhost:3000/mission`. Add `?api=core` (default, engine in the page),
`?api=mock` (offline five-category story), or `?api=http` (engine behind `app/api/core`). Shift+Esc
restarts it from Home.

## Verify

```bash
npm run typecheck
npm test                                   # node suites plus the mission UI suite in jsdom
AFFINITY_URL="http://localhost:3000/mission?api=core" node scripts/mission/demo-smoke.mjs
AFFINITY_URL="http://localhost:3000/mission?api=core" node scripts/mission/keyboard-smoke.mjs
```

## MVP implementation order

1. Lock the shared event contracts in `types/domain.ts`.
2. Build and test catalog filtering plus the council graph.
3. Connect the route stream to the stage UI using cached demo events first.
4. Add the 3D bundle assembly and happiness meters.
5. Wire gesture controls, keeping every keyboard fallback working.
6. Add WebCrypto signing only after the end-to-end demo loop is stable.
