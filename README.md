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
backend/                 Python LangGraph council and FastAPI endpoints
```

## Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The local URL is intentional because the Leap tracking WebSocket does not provide secure WebSockets.

### Agent backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.api:app --reload --port 8000
```

`DEMO_MODE=true` uses deterministic local opinions and scoring. Set it to `false` and provide `OPENAI_API_KEY` to use structured model output. Start a run with `POST /runs`, retain its `threadId`, then send the handshake result to `POST /runs/resume`.

## MVP implementation order

1. Lock the shared event contracts in `types/domain.ts`.
2. Build and test catalog filtering plus the council graph.
3. Connect the route stream to the stage UI using cached demo events first.
4. Add the 3D bundle assembly and happiness meters.
5. Wire gesture controls, keeping every keyboard fallback working.
6. Add WebCrypto signing only after the end-to-end demo loop is stable.
