import { describe, expect, it } from "vitest";
import {
  leapObservationSchema,
  missionSchema,
  productSchema,
  recommendationSchema,
  shopperProfileSchema,
  substitutionEvaluationSchema,
  voiceIntentSchema,
} from "@/shared/contracts";

describe("shared contract schemas", () => {
  it("accepts a representative mission", () => {
    expect(
      missionSchema.parse({
        id: "mission-1",
        title: "Cabin weekend",
        missionType: "group_trip_supplies",
        sharedBudget: 500,
        durationDays: 3,
        destination: "Lake cabin",
        participantIds: ["maya", "lee"],
        categories: ["cookware", "lighting"],
        status: "confirmed",
      }),
    ).toMatchObject({ id: "mission-1", status: "confirmed" });
  });

  it("accepts a shopper profile with taste, evidence, and confirmed constraints", () => {
    expect(
      shopperProfileSchema.parse({
        id: "maya",
        name: "Maya",
        avatarId: "avatar-maya",
        category: "cookware",
        preferences: { durability: 0.8, compactness: -0.2 },
        evidenceCounts: { durability: 2 },
        rules: ["no glass"],
        preferredUseTraits: ["easyGrip"],
        confirmedUseRequirements: ["oneHandUse"],
      }),
    ).toMatchObject({ id: "maya", confirmedUseRequirements: ["oneHandUse"] });
  });

  it("accepts product vectors with objective facts and satisfaction flags", () => {
    expect(
      productSchema.parse({
        id: "pan-1",
        name: "Trail Pan",
        category: "cookware",
        price: 45,
        imageUrl: "/demo/trail-pan.png",
        attributes: { durability: 0.9, compactness: 0.6 },
        facts: { material: "steel", weightGrams: 780, dishwasherSafe: true },
        satisfies: { noGlass: true, oneHandUse: true },
      }),
    ).toMatchObject({ id: "pan-1", price: 45 });
  });

  it("accepts a recommendation with eligibility, rejection, and score details", () => {
    expect(
      recommendationSchema.parse({
        selectedBundleId: "balanced",
        eligibleBundleIds: ["balanced"],
        rejectedBundles: [
          { bundleId: "premium", shopperId: "judge", violatedRequirement: "noGlass" },
        ],
        individualScores: [
          { shopperId: "maya", bundleId: "balanced", score: 0.84, reasons: ["Fits one-hand use"] },
        ],
        groupScores: { balanced: 0.82 },
        reasons: ["Meets every confirmed requirement"],
      }),
    ).toMatchObject({ selectedBundleId: "balanced", eligibleBundleIds: ["balanced"] });
  });

  it("accepts a typed voice intent", () => {
    expect(
      voiceIntentSchema.parse({
        transcript: "Find compact cookware under 100 dollars",
        intent: "filter_products",
        entities: { category: "cookware", maxPrice: 100, traits: ["compact"] },
        requiresConfirmation: false,
      }),
    ).toMatchObject({ intent: "filter_products", requiresConfirmation: false });
  });

  it("accepts a Leap observation", () => {
    expect(
      leapObservationSchema.parse({
        handsUsed: 1,
        activeHand: "right",
        approachSide: "front",
        spanBand: "medium",
        regraspObserved: false,
        trackingLossCount: 0,
      }),
    ).toMatchObject({ handsUsed: 1, activeHand: "right" });
  });

  it("accepts a substitution evaluation that identifies a violated requirement", () => {
    expect(
      substitutionEvaluationSchema.parse({
        decision: "pause",
        affectedShopperId: "maya",
        violatedRequirement: "oneHandUse",
        message: "Paused because the replacement does not support one-hand use for Maya.",
        actions: ["choose_alternative", "ask_shopper"],
      }),
    ).toMatchObject({ decision: "pause", affectedShopperId: "maya", violatedRequirement: "oneHandUse" });
  });

  it("rejects unknown mission keys", () => {
    const result = missionSchema.safeParse({
      id: "mission-1",
      title: "Cabin weekend",
      missionType: "group_trip_supplies",
      sharedBudget: 500,
      participantIds: [],
      categories: [],
      status: "draft",
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });
});
