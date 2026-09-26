# Affinity Experience — Terminal 2 status

Branch: `feature/affinity-experience` · Owner: Frontend & Experience Lead · Last updated: 2026-09-26

> **Update (2026-09-26):** the experience no longer ships as a separate Vite app. It runs inside the
> Next app at `/mission`: UI in `components/mission/`, state and adapters in `lib/mission/`, the HTTP
> adapter in `app/api/core/[...path]/route.ts`, and smoke scripts in `scripts/mission/`. The mission
> table is now the Hearth living room with People Maker characters. Paths below that start with
> `frontend/` refer to the old layout.

Terminal 2 owns `frontend/**`, `leap-bridge/**`, `public/models/**`, `public/demo-assets/**`, and `tests/ui/**`. No backend or shared-contract files have been modified.

## Current screen/state implemented

Every screen in the state machine is implemented and reachable (`frontend/src/state/machine.ts`):

| State | Status | Notes |
|---|---|---|
| HOME | Done | Text entry, push-to-talk, examples, one-button preloaded transcript |
| TRANSCRIPT_CONFIRMATION | Done | Use this / Try again / Edit transcript; demo transcript labeled as not live |
| MISSION_BRIEF | Done | Editable title, budget, days, people; "building the cart, not booking the trip" copy |
| PARTICIPANT_RESOLUTION | Done | Ready/missing per person; Invite (mock), Create shopper here, Continue without profile |
| SHOPPER_CREATION | Done | Name, avatar, one rule; "Rules only change when you edit them" |
| QUICK_CHOICES | Done | 4 pairs; A / Neither / B / Skip buttons, keys, voice words, Leap swipe; per-choice signal feedback |
| PROFILE_CONFIRMATION | Done | Strong / Weak / Still unknown plus evidence counts; rules shown separately; no percentages |
| MISSION_SPACE | Done | Top bar, categories, 3D table (2D fallback), cart, before/after decision, compare, why, command bar |
| LEAP_CHECK | Done | Live capture, recorded session (labeled), or manual buttons; Required / Preferred / Just what happened |
| SUBSTITUTION_APPROVAL | Done | Paused (amber), conflict (red), compatible (green), Ask, Override with confirmation |
| COMPLETE | Done | Approval requested; "Mock authorization — no payment was made" |

## Mock mode status

- Three adapter modes, chosen with `?api=` (or `VITE_AFFINITY_API`):
  - **`core` (default):** Terminal 1's real `AffinityCoreService` running in the page. No network, server, or API key.
  - **`mock`:** offline fixtures in `frontend/src/mocks`, telling the brief's richer $380 five-category story.
  - **`http`:** Terminal 1's endpoint map over fetch.
- Verified in Chrome by `frontend/scripts/demo-smoke.mjs` in all three modes, HOME → COMPLETE, with every non-localhost request blocked: 0 external requests, 0 page errors.
- `frontend/scripts/keyboard-smoke.mjs` passes in core and mock modes (Tab/Enter/arrow keys only).

## Backend endpoints connected

Integrated with Terminal 1's frozen contract (`aa84580`) and engine (`688b88d`, merged into this branch).

- `frontend/src/services/engineApi.ts` implements `AffinityApi` over a `CoreTransport` that mirrors `AffinityCoreService` method-for-method.
- Two transports share it: in-page (`core`) and HTTP (`http`).
- Terminal 1's API.md asks Terminal 2 to own the HTTP layer. `frontend/vite.config.ts` mounts it at `/api/core` on the dev server, following `shared/contracts/api.ts`, with errors mapped to 400/404/409.

| Adapter method | Engine call (HTTP route) | Status |
|---|---|---|
| parseMission | parseMission (POST /missions/parse) | Connected, verified |
| createMission | createMission (POST /missions) | Connected, verified |
| resolveParticipants | getMission (GET /missions/:id), with names matched to profiles | Connected, verified |
| createShopper | createShopper (POST /shoppers) | Connected, verified |
| confirmShopper | addParticipant (POST /missions/:id/participants) | Connected; the guest joins the group on profile confirmation |
| submitComparison | applyShopperComparison (POST /shoppers/:id/comparisons) | Connected, verified |
| addShopperRule | addShopperRule (POST /shoppers/:id/rules) | Connected, verified |
| recommend | recommend (POST /missions/:id/recommend) | Connected; Premium before → Balanced after verified |
| interpretVoice | interpretVoice (POST /voice/interpret) | Connected (see parser gaps below) |
| submitUseObservation | record + confirm (POST …/use-observations, …/use-requirements) | Connected, verified |
| evaluateSubstitution | evaluateSubstitution (POST …/substitutions/evaluate), including `overrideApproved` | Connected; pause for Maya, compatible alternative, and override verified |
| getShoppers / getComparisonPairs / getCatalog | `shared/data/*.json` (read-only) plus the profiles the engine returned | No endpoint; same fixtures the engine seeds from |

Tests covering the integration:

- `tests/ui/engine.test.tsx`: full UI story on the real engine, override round-trip, and command policy.
- `tests/core`: Terminal 1's own 44 tests, still passing on the merged branch.

## Contract assumptions

- Types now come from `@/shared/types`; `frontend/src/services/contracts.ts` only aliases them and adds UI-side adapter shapes (`ParticipantResolution`, `CreateShopperInput`, `ComparisonInput`, `UseObservationInput`, `Catalog`).
- `ComparisonPair` gets an optional UI-only `difference` sentence for "Tell me the difference".
- The Leap bridge emits the frozen `LeapObservation` enums: `activeHand` includes `unknown`, and `spanBand` is `small | medium | large`.
- The frontend creates the guest as shopper id `judge`, which replaces the engine's seeded judge profile. Evidence comes only from the guest's four choices.
- Choice feedback direction ("Durability +1 signal" versus "Lower price") comes from which side of the pair has the higher value. Terminal 1's values are attribute levels, not ±1.
- Scores are displayed on a 0–100 scale (the engine returns 0–1). This is formatting only.
- Substitution candidates are same-category products cheaper than the current item. The engine decides every one; nothing is hard-coded to product IDs.
- The frontend supplies images for Terminal 1's `imageUrl` paths (`public/demo-assets/*.png`) and maps products without a `modelUrl` to local GLBs by name, for presentation only.

## Requests for Terminal 1

1. **Voice parser gaps.** These are tracked as `it.fails` in `tests/ui/engine.test.tsx`; the tests flip when fixed:
   - "Remove products with glass." parses as `modify_cart` / `remove`. It should be a glass exclusion (`excludedMaterial: "glass"`). The UI would offer the rule with confirmation.
   - "Ask everyone for approval." falls through to `filter_products`. It should be `approve_action`: `\bapprove\b` doesn't match "approval".
   - `navigate_category` and `explain_decision` carry no `category` / `shopperId` entities. The UI currently resolves on-screen names from the transcript as a fallback.
2. **Jonathan has no shopper fixture.** The parser returns Jonathan as a participant (speaker), but `shared/data/shoppers.json` has only Maya, Alex, and Judge, so Jonathan shows "No shopper yet".
3. **Catalog depth.** All six products are `cabin_supplies` coffee gear, so the cart is one category at $81 of $400. The brief's cart has Cooking / Safety / Comfort / Entertainment / Shared essentials at about $380. The "compatible alternative" for the Easy Press is a mug, because every product shares one category.
4. **Comparison pairs** compare different products (for example, a mug versus a pump brewer) rather than near-identical pairs that differ only in the tested tradeoff, as the Terminal 2 brief asks.
5. **Read endpoints** would let the HTTP mode stop importing fixtures: `GET /missions/:id/shoppers`, `GET /comparisons?category=`, `GET /catalog`.
6. **Mission changes by voice:** budget changes parse as `create_mission` with `sharedBudget`, which the UI confirms. There's no update-mission method, so a confirmed change is acknowledged but not applied.
7. **`/shoppers/:id/confirm`** is mapped to use-observation confirmation. The UI's "profile confirmed" step therefore has no engine call, beyond adding the guest to the mission.

## Voice/Leap fallback status

| Feature | Primary | Fallback | Status |
|---|---|---|---|
| Mission creation | Push-to-talk (Web Speech API) | Typed text; one-button preloaded transcript | Done |
| Transcript | Always shown | Editable before use | Done |
| Quick choices | Buttons / keys (← → N S D) | Voice words; Leap swipe | Done |
| 3D inspection | Mouse orbit, Leap palm and pinch | Rotate / Inspect / Reset buttons, arrow keys, 2D table view | Done |
| 3D load failure | GLB | Procedural mesh per model; scene error or no WebGL → 2D table | Done |
| Commands | Push-to-talk | Command bar and suggested-command chips | Done |
| Consequential commands | Confirmation dialog | Keyboard dialog (focus trap, Esc cancels) | Done |
| Leap check | Live 4 s capture | Recorded session (labeled "not live"); manual buttons; unstable tracking → fallback | Done |
| Leap connection | ws://127.0.0.1:6437/v6.json | Retries with backoff; status chip always visible | Done |

The UI never claims object recognition, force, comfort, pain, or accessibility. Only the user's Required / Preferred answer changes the profile.

## UI test status

- `tests/ui/engine.test.tsx`: Terminal 1 ↔ Terminal 2 integration (full story on the real engine, override, command policy, spec voice commands). 7 pass; 3 are expected-fail parser gaps.

- `tests/ui/leap-observe.test.ts`: observation rules, parser, client without WebSocket (passing).
- `tests/ui/flow.test.tsx` (14 required UI tests) and `tests/ui/machine.test.ts` (10 state-machine tests): passing.
- The suite totals 58 tests across 4 files, all passing (`cd frontend && npm test`); `npm run typecheck` is clean.
- Browser smokes (`demo-smoke.mjs`, `keyboard-smoke.mjs`): passing in mock, core, and http modes.
