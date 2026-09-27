# Affinity

A spatial, multi-person decision-making demo. Each family member or friend is an Affinity character with a learned taste. For a Christmas gift, the characters gather as a Shopping Council in a 3D living room, a Python LangGraph backend searches Shopify (or a local demo catalog), the characters state opinions, deliberate, score, and revise, and the human approves with a handshake before a merchant cart is created. Affinity never submits payment.

## Project layout

```text
app/                    Next.js App Router pages and API route handlers
  page.tsx              Home: the Character Plaza hub (pick an activity, a recipient, advisors)
  create/               People Maker: build how you look → teach it what you like → meet your character
  council/              The living-room Shopping Council (3D stage, HUD, gestures)
  lab/                  Diagnostics: event stepper, beat tuning, technical phase names
  api/council/          SSE proxies to the Python backend (start and resume); credentials stay server-side
components/             3D stage, Plaza, People Maker, HUD, shared Plaza-style controls (components/ui)
lib/director/           Turns backend events into paced stage beats; owns the start/resume lifecycle
lib/stage/              Rendered session state (zustand) and the semantic gesture bus
lib/people/             Roster of people, looks, circles, and taste profiles (validated localStorage)
lib/taste/              Pure taste model: traits, evidence-based updates, adaptive comparisons, summaries
lib/product/            Product media selection (3D model → image → card) and pedestal layout
lib/gestures/           Leap/MediaPipe/pointer/keyboard adapters and gesture detection
lib/crypto/             Browser handshake signing and server verification
lib/demo/               The labeled replay transcript used when the backend is unavailable
data/                   Local catalog (tree demo), local gift catalog, family fixtures
backend/                Python LangGraph council, Shopify UCP, Google Places, FastAPI endpoints
types/                  Shared contracts; types/domain.ts mirrors backend/models.py
tests/                  vitest unit and integration tests (backend tests live in backend/tests)
```

## Start

```bash
npm install
cp .env.example .env.local   # then add your keys
npm run dev
```

Open `http://localhost:3000`. The local URL is intentional because the Leap tracking WebSocket does not provide secure WebSockets.

### Agent backend

```bash
uv venv .venv --python 3.12          # or: python3 -m venv .venv
uv pip install --python .venv/bin/python -r backend/requirements.txt
.venv/bin/python -m uvicorn backend.api:app --port 8000 --env-file .env.local
```

The backend reads its provider credentials from the env file you pass (`load_dotenv()` alone only reads `.env`). The Next routes reach it through `AFFINITY_BACKEND_URL` (default `http://127.0.0.1:8000`); the browser never sees the backend URL or any key.

- `DEMO_MODE=true` uses deterministic local opinions and scoring. Set it to `false` and provide `OPENAI_API_KEY` for model-generated character reasoning.
- `AFFINITY_PRODUCT_PROVIDER=shopify_ucp` with the `SHOPIFY_UCP_*` credentials searches the live Shopify catalog and creates merchant carts after approval; `local` (the default) uses `data/catalog.json` and `data/gifts.json`. If Shopify fails mid-run the backend falls back to the local catalog and says so in the bundle's warnings.
- See `backend/AGENT_INTEGRATION.md` for the full event and payload contract and `backend/INTEGRATIONS.md` for provider setup.

### Demo flags

- `/council?demo` plays the recorded Christmas-tree transcript with its latencies, labeled "Demo replay". A replay has no backend thread, so it cannot be approved.
- `/council?cut=90` uses the tighter beat timings for a 90-second walkthrough.
- If the backend is unreachable or silent for 4 s, the council falls back to the same labeled replay. A backend `error` frame is shown as an error with retry, never replaced by replay.

## The demo path

People Maker → taste comparisons → meet your character → Plaza home → Christmas gifts → pick a recipient and advisors → council → live (or labeled fallback) products → visible discussion and scoring → replace or approve with the handshake → backend preflight → merchant cart handoff.

## Checks

```bash
npx tsc --noEmit --incremental false
npx vitest run
.venv/bin/python -m pytest backend/tests -q
npm run build
```
