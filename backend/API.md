# Affinity Core Engine API

Contract baseline: `aa84580` (`@/shared/types`, `@/shared/contracts`).

`AffinityCoreService` in `backend/service.ts` is the transport-neutral implementation. It is intentionally not mounted in `app/api/**`, which is outside Terminal 1 ownership. A transport adapter should deserialize a request, call the matching service method, and serialize the returned frozen DTO.

## Endpoint mapping

- `POST /missions/parse` → `service.parseMission({ text })`
  - Returns `ParsedMission`.
  - Uses an optional structured extractor, validates it, and falls back to the deterministic parser.
  - Missing mission type or budget returns exactly one `clarificationQuestion`.
- `POST /missions` → `service.createMission({ mission })`
- `GET /missions/:missionId` → `service.getMission(missionId)`
- `POST /missions/:missionId/participants` → `service.addParticipant(missionId, { shopperId })`
- `POST /missions/:missionId/shoppers` → same participant operation.
- `POST /shoppers` → `service.createShopper({ shopper })`
- `POST /shoppers/:shopperId/rules` → `service.addShopperRule(shopperId, { rule })`
- `POST /shoppers/:shopperId/comparisons` → `service.applyShopperComparison(shopperId, request)`
  - `skip` and `neither` add no evidence.
  - Comparison products must match the shopper's category.
- `POST /shoppers/:shopperId/use-observations` → `service.recordShopperUseObservation(shopperId, { observation })`
  - Records a bounded observation but cannot change rules, preferences, or requirements.
- `POST /shoppers/:shopperId/confirm` → `service.confirmShopperUseObservation(shopperId, request)`
- `POST /shoppers/:shopperId/use-requirements` → same confirmation operation.
  - Confirmation must match the shopper's pending recorded observation.
  - `required` updates `confirmedUseRequirements`.
  - `preferred` updates `preferredUseTraits`.
  - `incidental` discards the observation.
- `POST /shoppers/:shopperId/events` → `service.acceptShopperEvent(shopperId, event)`
  - Prototype acknowledgement seam; no passive event can change rules.
- `POST /voice/interpret` → `service.interpretVoice({ transcript })`
  - Structured extraction is validated and has a deterministic fallback.
  - Budget/participant/rule changes and approval/override actions require confirmation.
- `POST /missions/:missionId/recommend` → `service.recommend(missionId, request)`
  - Filters over-budget and rule-ineligible bundles before ranking.
  - Optional `shopperIds` are additive; they cannot omit existing mission participants.
  - Ranking is deterministic: 60% lowest satisfaction, 30% average satisfaction, 10% value.
- `POST /missions/:missionId/substitutions/evaluate` → `service.evaluateSubstitution(missionId, request)`
  - Returns `pause` with `affectedShopperId` and `violatedRequirement` when a replacement conflicts.
  - Claimed savings must match the two curated product prices.
  - An override is allowed only when `overrideApproved === true`.

## Errors

The service throws `Error` for unknown IDs, path/body mission mismatches, cross-category comparisons, no eligible bundles, or invalid schema input. An HTTP adapter should map invalid input to `400`, unknown IDs to `404`, and an empty eligible set/conflict to `409` without changing the response DTOs.

## Determinism and LLM boundary

An LLM may only propose structured mission or voice-intent data. Zod validates that proposal. Eligibility, requirement enforcement, affinity, group scoring, explanations, observation confirmation, and substitution policy are local deterministic code and never call an LLM.

## Demo

Construct `new AffinityCoreService()` to seed the local cabin mission, Maya, Alex, Judge, products, and bundles. Recommending for Maya and Alex selects `Premium Cabin Bundle`; adding Judge selects `Balanced Cabin Bundle` because Premium violates `no_fragile_glass` and Balanced aligns with Judge's durability evidence.
