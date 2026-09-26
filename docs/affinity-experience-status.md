# Affinity Experience — Terminal 2 status

Branch: `feature/affinity-experience` · Owner: Frontend & Experience Lead · Last updated: 2026-09-26

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

- On by default (`?api=mock`). The whole story runs with no network, microphone, backend, Leap, or external APIs.
- Fixtures: `frontend/src/mocks/{mission,shoppers,products,recommendation,substitution}.ts`.
- Verified in Chrome by `frontend/scripts/demo-smoke.mjs`: HOME → COMPLETE with every non-localhost request blocked. 0 external requests, 0 page errors (the only console errors are refused Leap socket connections, which is expected with no hardware).
- The mock only picks between fixed fixtures. It never scores bundles. Its one arithmetic step copies the `applyComparison` reference from the Terminal 1 brief.

## Backend endpoints connected

None are verified yet: no Terminal 1 server exists on any branch. `frontend/src/services/httpApi.ts` implements every call against the Terminal 1 API surface and is selected with `?api=http`. Planned connection order: parse → shoppers → comparisons → recommend → voice → use-observations → substitutions.

| Adapter method | Endpoint | Status |
|---|---|---|
| parseMission | POST /missions/parse | Written; falls back to fixture on failure |
| createMission | POST /missions | Written, untested |
| resolveParticipants | POST /missions/:id/participants | Written, untested (response shape assumed) |
| createShopper | POST /shoppers + POST /missions/:id/shoppers | Written, untested |
| submitComparison | POST /shoppers/:id/comparisons | Written, untested |
| confirmShopper | POST /shoppers/:id/confirm | Written, untested |
| addShopperRule | POST /shoppers/:id/rules | Written, untested |
| recommend | POST /missions/:id/recommend | Written, untested |
| interpretVoice | POST /voice/interpret | Written; falls back to fixture on failure |
| submitUseObservation | POST /shoppers/:id/use-observations, then /use-requirements | Written, untested |
| evaluateSubstitution | POST /missions/:id/substitutions/evaluate | Written, untested |
| getShoppers / getComparisonPairs / getCatalog | — | No endpoint; uses fixtures |

## Contract assumptions

The shared contract isn't frozen yet. `frontend/src/services/contracts.ts` is a local copy, marked for replacement:

- The mirrored types (`Mission`, `ShopperProfile`, `Product`, `Bundle`, `IndividualScore`, `Recommendation`, `VoiceIntent`) are copied verbatim from the Terminal 1 brief.
- The frontend-defined shapes below are pending Terminal 1:
  - `MissionDraft` (Deliverable 1 output plus optional `clarificationQuestion`)
  - `ParticipantResolution { name, shopperId | null, status: "ready" | "missing" }`
  - `CreateShopperInput { missionId, name, avatarId, category, rule | null }`
  - `ComparisonPair` (Deliverable 4 plus a `difference` sentence for "Tell me the difference")
  - `ComparisonInput { pairId, choice, rejectionReason? }`
  - `UseObservation` (Deliverable 8)
  - `UseObservationInput { productId, observation, classification, source }`
  - `SubstitutionInput` / `SubstitutionResult` (Deliverable 9)
- Before/after is obtained by calling `recommend` twice: once after the mission is created, and again after the judge's profile is confirmed.
- Signal strength is presentation over `evidenceCounts`: 0 → Still unknown, 1 → Weak, ≥ 2 or |preference| ≥ 2 → Strong. With one comparison per axis, the judge's first read shows Weak signals. That's honest, but it differs from the brief's mock-up.

## Requests for Terminal 1

1. **Freeze the shapes above** in `shared/types`, especially `ParticipantResolution`, `CreateShopperInput`, and `UseObservationInput`. I'll switch imports as soon as the freeze commit lands.
2. **Read endpoints needed by the UI:**
   - `GET /missions/:id/shoppers`: profiles for names, avatars, and reactions.
   - `GET /comparisons?category=cabin_supplies`: the four pairs.
   - `GET /missions/:id/catalog`: products and bundles referenced by `Recommendation`.
3. **Mission changes by voice:** `VoiceIntent.intent` has no value for changing budget or participants. Please add `modify_mission` with `entities.field` / `entities.value`, and an explicit `unknown` intent for unrecognized commands. Today the fixture uses `filter_products` with `missionField`, which the UI treats as needing confirmation.
4. **Substitution source:** the UI currently asks about the demo pair (`easy_press` → `basic_pump`, saves $8). Please expose either a suggestion endpoint or `SubstitutionResult.alternativeProductId` for "Choose compatible alternative" (the fixture uses `compact_press`).
5. **Generic ask action:** `actions: ["ask_maya"]` embeds a name. Could it be `ask_affected_shopper`? The UI handles any `ask_*` value today.
6. **Fixture consistency:** in the brief's table, Maya scores Premium at 61. Under 0.6·min + 0.3·avg + 0.1·value, Premium can't win before the judge joins if Maya is at 61. The mock keeps Maya at 88 on Premium both before and after. Please pick fixture scores where Premium wins with only Maya and Alex, and Balanced wins once the judge's rule removes Premium.
7. **Optional:** a per-axis signal strength on the profile response, so "Strong vs Weak" comes from the engine.
8. **Use observation:** confirm whether the observation and the classification go in one call or two. The adapter sends two.

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

- `tests/ui/leap-observe.test.ts`: observation rules, parser, client without WebSocket (passing).
- `tests/ui/flow.test.tsx`, `tests/ui/machine.test.ts`: the 14 required UI tests plus state-machine unit tests (see the latest run in the commit message).
- `frontend/scripts/demo-smoke.mjs`: full story in real Chrome with external network blocked (passing).
