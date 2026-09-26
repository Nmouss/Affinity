# Affinity Core Engine status

## Current phase

Phase 14 — implementation complete; final verification and Terminal 2 handoff.

## Completed endpoints

Transport-neutral equivalents are ready on `AffinityCoreService` for:

- Mission parse/create/read and participant addition
- Shopper create, rule addition, comparison updates, and event acknowledgement
- Leap observation recording and explicit classification
- Voice-intent interpretation
- Mission recommendation
- Substitution evaluation

## Contract commit hash

`aa84580` — final frozen revision, published on `origin/feature/affinity-core`.

## Assumptions and interface questions

- Prototype prices are USD numeric values.
- The fixed demo uses the `cabin_supplies` product category.
- Existing `types/domain.ts` remains unchanged for the current holiday demo; Terminal 2 should import new contracts from `@/shared/types` and validators from `@/shared/contracts`.
- Terminal 1 will expose typed, transport-neutral handlers under `backend/**`. The Next route layer is outside Terminal 1 ownership.
- Terminal 2 needs to confirm which owned layer will mount the handlers as HTTP endpoints.
- Mission parsing and voice interpretation accept an optional structured extractor, but deterministic fallbacks must work without a network or API key.

## Known limitations

- State is in-memory and seeded from the curated local fixtures; there is no database persistence.
- The endpoint implementation is transport-neutral because `app/api/**` is outside Terminal 1 ownership.
- Structured LLM extractors are optional injection points and are not configured by default.
- No payment execution, live commerce catalog, or dynamic model retrieval is implemented.

## Requests for Terminal 2

- Consume the frozen shared DTOs rather than duplicating interface definitions.
- Treat Leap observations as unconfirmed until the user returns `required`, `preferred`, or `incidental`.
- Mount thin HTTP adapters for the methods documented in `backend/API.md`, or call the service locally.
- Use shopper-specific substitution actions such as `ask_maya` from the final contract revision.

## Test status

- `npm run typecheck` — passing.
- `npm test -- tests/core` — 44 passing across 7 test files.
- `npm test` — 203 passing outside the sandboxed replay server; the isolated replay suite then passed 2/2 with localhost binding permission.
- Required fixed demo verified: Premium before Judge; Balanced after Judge; Premium rejected by Judge's no-glass rule.
