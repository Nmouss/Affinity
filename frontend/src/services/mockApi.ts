import type { AffinityApi } from "./affinityApi";
import type { ComparisonPair, Mission, ShopperProfile, VoiceIntent } from "./contracts";
import { mockParse } from "../mocks/mission";
import { bundles, comparisonPairs, products } from "../mocks/products";
import {
  recommendationAfterJudge,
  recommendationBeforeJudge,
  recommendationJudgeNoRule,
} from "../mocks/recommendation";
import { blankShopper, existingShoppers } from "../mocks/shoppers";
import { allowedSubstitution, pausedSubstitution } from "../mocks/substitution";

// In-memory stand-in for Terminal 1. It only selects between fixed fixtures; the one piece of
// arithmetic (applying a comparison) copies the reference applyComparison from the Terminal 1 brief
// so onboarding feedback behaves the way the real endpoint will. No scoring happens here.

const clone = <T>(value: T): T => structuredClone(value);
const idFor = (name: string) => name.trim().toLowerCase().replace(/\s+/g, "_");

export function createMockApi({ latencyMs = 250 } = {}): AffinityApi {
  const shoppers = new Map<string, ShopperProfile>(existingShoppers.map((s) => [s.id, clone(s)]));
  const confirmed = new Set(existingShoppers.map((s) => s.id));
  const missions = new Map<string, Mission>();
  const observations: { shopperId: string; classification: string }[] = [];

  const wait = <T>(value: T): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(clone(value)), latencyMs));

  const mission = (id: string) => {
    const found = missions.get(id);
    if (!found) throw new Error(`Unknown mission ${id}`);
    return found;
  };

  function pairFor(pairId: string): ComparisonPair {
    const pair = comparisonPairs.find((p) => p.pairId === pairId);
    if (!pair) throw new Error(`Unknown comparison ${pairId}`);
    return pair;
  }

  return {
    mode: "mock",

    parseMission: (text) => wait(mockParse(text)),

    createMission(draft) {
      const created: Mission = {
        id: "cabin_01",
        title: draft.title,
        missionType: draft.missionType ?? "group_trip_supplies",
        sharedBudget: draft.sharedBudget ?? 0,
        durationDays: draft.durationDays,
        destination: draft.destination,
        participantIds: draft.participantNames.map(idFor),
        categories: draft.categories,
        status: "confirmed",
      };
      missions.set(created.id, created);
      return wait(created);
    },

    resolveParticipants(missionId) {
      const found = mission(missionId);
      return wait(
        found.participantIds.map((id) => {
          const shopper = shoppers.get(id);
          const ready = Boolean(shopper && confirmed.has(id));
          return {
            name: shopper?.name ?? id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " "),
            shopperId: ready ? id : null,
            status: ready ? ("ready" as const) : ("missing" as const),
          };
        }),
      );
    },

    createShopper(input) {
      // The demo guest is always stored as "judge" so fixtures can reference it.
      const profile = blankShopper("judge", input.name.trim() || "Guest", input.avatarId, input.rule);
      shoppers.set(profile.id, profile);
      const found = mission(input.missionId);
      const guestIndex = found.participantIds.findIndex((id) => !shoppers.has(id) || id === "guest");
      if (guestIndex >= 0) found.participantIds[guestIndex] = profile.id;
      else if (!found.participantIds.includes(profile.id)) found.participantIds.push(profile.id);
      return wait(profile);
    },

    submitComparison(shopperId, input) {
      const profile = shoppers.get(shopperId);
      if (!profile) throw new Error(`Unknown shopper ${shopperId}`);
      const pair = pairFor(input.pairId);
      if (input.choice === "left" || input.choice === "right") {
        const value = input.choice === "left" ? pair.leftValue : pair.rightValue;
        profile.preferences[pair.axis] = (profile.preferences[pair.axis] ?? 0) + value;
        profile.evidenceCounts[pair.axis] = (profile.evidenceCounts[pair.axis] ?? 0) + 1;
      }
      return wait(profile);
    },

    confirmShopper(shopperId) {
      const profile = shoppers.get(shopperId);
      if (!profile) throw new Error(`Unknown shopper ${shopperId}`);
      confirmed.add(shopperId);
      return wait(profile);
    },

    addShopperRule(shopperId, rule) {
      const profile = shoppers.get(shopperId);
      if (!profile) throw new Error(`Unknown shopper ${shopperId}`);
      if (!profile.rules.includes(rule)) profile.rules.push(rule);
      return wait(profile);
    },

    recommend(missionId) {
      const judge = shoppers.get("judge");
      const judgeIn = mission(missionId).participantIds.includes("judge") && confirmed.has("judge");
      if (!judge || !judgeIn) return wait(recommendationBeforeJudge);
      return wait(judge.rules.includes("no_fragile_glass") ? recommendationAfterJudge : recommendationJudgeNoRule);
    },

    interpretVoice: (transcript) => wait(mockInterpret(transcript)),

    submitUseObservation(shopperId, input) {
      const profile = shoppers.get(shopperId);
      if (!profile) throw new Error(`Unknown shopper ${shopperId}`);
      const trait = input.observation.handsUsed === 1 ? "one_hand_operation" : "two_hand_operation";
      if (input.classification === "required" && !profile.confirmedUseRequirements.includes(trait)) {
        profile.confirmedUseRequirements.push(trait);
      } else if (input.classification === "preferred" && !profile.preferredUseTraits.includes(trait)) {
        profile.preferredUseTraits.push(trait);
      }
      observations.push({ shopperId, classification: input.classification });
      return wait(undefined);
    },

    evaluateSubstitution(_missionId, input) {
      const replacement = products.find((p) => p.id === input.replacementProductId);
      if (input.overrideApproved) return wait({ decision: "allow" as const, message: "Override approved by a human.", actions: [] });
      return wait(replacement?.satisfies.one_hand_operation === false ? pausedSubstitution : allowedSubstitution);
    },

    getShoppers(missionId) {
      const ids = mission(missionId).participantIds;
      return wait(ids.map((id) => shoppers.get(id)).filter((s): s is ShopperProfile => Boolean(s)));
    },

    getComparisonPairs: () => wait(comparisonPairs),

    getCatalog: () => wait({ products, bundles }),
  };
}

/** Mock stand-in for POST /voice/interpret: keyword matching over the supported command set. */
export function mockInterpret(transcript: string): VoiceIntent {
  const text = transcript.toLowerCase();
  const intent = (
    name: VoiceIntent["intent"],
    entities: VoiceIntent["entities"] = {},
    requiresConfirmation = false,
  ): VoiceIntent => ({ transcript, intent: name, entities, requiresConfirmation });

  const budget = /budget[^\d$]*\$?\s?(\d+)/.exec(text);
  if (budget) return intent("filter_products", { missionField: "sharedBudget", value: Number(budget[1]) }, true);
  if (/\b(add|invite)\b.*\b(person|people|participant|friend)\b/.test(text) || /\bremove\b.*\b(maya|alex|jonathan)\b/.test(text)) {
    return intent("filter_products", { missionField: "participants" }, true);
  }
  if (text.includes("glass")) return intent("filter_products", { excludedMaterial: "glass", proposedRule: "no_fragile_glass" }, true);
  if (text.includes("approv")) return intent("approve_action", { scope: "group" }, true);
  if (text.includes("why")) {
    const who = ["maya", "alex", "jonathan"].find((name) => text.includes(name)) ?? "maya";
    return intent("explain_decision", { shopperId: who });
  }
  if (text.includes("cheaper")) return intent("filter_products", { priceDirection: "lower" });
  if (text.includes("compare")) return intent("compare_products");
  if (/\badd\b/.test(text)) return intent("modify_cart", { operation: "add" });
  if (/\bremove\b/.test(text)) return intent("modify_cart", { operation: "remove" });
  const category = ["cooking", "safety", "comfort", "entertainment", "essentials"].find((c) => text.includes(c));
  if (category) return intent("navigate_category", { category: category === "essentials" ? "shared_essentials" : category });
  return intent("explain_decision", { unrecognized: "true" });
}
