import { describe, expect, it } from "vitest";
import {
  comparisonPairSchema,
  recommendationSchema,
  shopperProfileSchema,
  substitutionEvaluationSchema,
  voiceIntentSchema,
} from "@/shared/contracts";
import { AffinityCoreService } from "@/backend/service";
import comparisons from "@/shared/data/comparisons.json";
import demoExpectations from "@/shared/data/demo-expectations.json";
import substitutions from "@/shared/data/substitutions.json";

const parsedComparisons = comparisonPairSchema.array().parse(comparisons);

describe("AffinityCoreService demo flow", () => {
  it("reads the seeded mission and switches the recommendation after Judge joins", () => {
    const service = new AffinityCoreService();
    const mission = service.getMission("cabin-trip");

    expect(mission).toEqual(demoExpectations.mission);
    expect(service.recommend(mission.id)).toMatchObject({
      selectedBundleId: "premium-cabin",
    });

    const joinedMission = service.addParticipant(mission.id, { shopperId: "judge" });
    expect(joinedMission.participantIds).toContain("judge");

    const judge = service.applyShopperComparison("judge", {
      pair: parsedComparisons[0]!,
      choice: "left",
    });
    expect(shopperProfileSchema.parse(judge)).toEqual(judge);
    expect(judge.evidenceCounts.durability).toBeGreaterThan(3);

    const recommendation = recommendationSchema.parse(service.recommend(mission.id));
    expect(recommendation.selectedBundleId).toBe("balanced-cabin");
    expect(recommendation.eligibleBundleIds).not.toContain("premium-cabin");
    expect(recommendation.rejectedBundles).toContainEqual({
      bundleId: "premium-cabin",
      shopperId: "judge",
      violatedRequirement: "no_fragile_glass",
    });
    expect(
      recommendation.individualScores.find(
        ({ shopperId, bundleId }) => shopperId === "judge" && bundleId === "balanced-cabin",
      )?.reasons.join(" ").toLowerCase(),
    ).toContain("durability");
  });

  it("keeps a Leap observation passive until the shopper confirms it", () => {
    const service = new AffinityCoreService();
    const before = recommendationSchema.parse(service.recommend("cabin-trip"));
    const observation = {
      handsUsed: 1,
      activeHand: "right" as const,
      approachSide: "front" as const,
      spanBand: "medium" as const,
      regraspObserved: false,
      trackingLossCount: 0,
    };

    expect(service.recordShopperUseObservation("alex", { observation })).toEqual({ recorded: true });
    expect(recommendationSchema.parse(service.recommend("cabin-trip"))).toEqual(before);

    const confirmed = service.confirmShopperUseObservation("alex", {
      observation,
      classification: "required",
    });
    expect(shopperProfileSchema.parse(confirmed.shopper)).toEqual(confirmed.shopper);
    expect(confirmed).toMatchObject({ appliedRequirement: "one_hand_operation", discarded: false });
    expect(confirmed.shopper.confirmedUseRequirements).toContain("one_hand_operation");
  });

  it("rejects confirmation when no matching observation is pending", () => {
    const service = new AffinityCoreService();
    const observation = {
      handsUsed: 1,
      activeHand: "right" as const,
      approachSide: "front" as const,
      spanBand: "medium" as const,
      regraspObserved: false,
      trackingLossCount: 0,
    };

    expect(() =>
      service.confirmShopperUseObservation("alex", { observation, classification: "required" }),
    ).toThrow("No pending use observation");
  });

  it("returns a typed shopper for comparison updates, pauses unsafe substitutions, and interprets voice", async () => {
    const service = new AffinityCoreService();
    const judge = service.applyShopperComparison("judge", {
      pair: parsedComparisons[0]!,
      choice: "left",
    });
    expect(shopperProfileSchema.parse(judge)).toEqual(judge);

    const substitutionFixture = substitutions.find(
      ({ name }) => name === "pause_one_hand_requirement_violation",
    );
    expect(substitutionFixture).toBeDefined();
    const substitution = substitutionEvaluationSchema.parse(
      service.evaluateSubstitution("cabin-trip", substitutionFixture!.request),
    );
    expect(substitution).toMatchObject({
      decision: "pause",
      affectedShopperId: "maya",
      violatedRequirement: "one_hand_operation",
    });
    expect(substitution.message).toContain("Maya");
    expect(substitution.message).toContain("one-hand");

    const voice = voiceIntentSchema.parse(
      await service.interpretVoice({ transcript: "Approve this purchase" }),
    );
    expect(voice).toMatchObject({ intent: "approve_action", requiresConfirmation: true });
  });
});
