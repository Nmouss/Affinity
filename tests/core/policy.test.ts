import { describe, expect, it } from "vitest";
import { confirmUseObservation, recordUseObservation } from "@/backend/core/observations";
import { evaluateSubstitution } from "@/backend/core/substitution";
import { productSchema } from "@/shared/contracts";
import products from "@/shared/data/products.json";
import shoppers from "@/shared/data/shoppers.json";
import substitutionFixtures from "@/shared/data/substitutions.json";
import type {
  LeapObservation,
  ShopperProfile,
  SubstitutionEvaluationRequest,
} from "@/shared/types";

const profiles = shoppers as ShopperProfile[];
const maya = profiles.find((shopper) => shopper.id === "maya")!;
const parsedProducts = productSchema.array().parse(products);
const productById = (id: string) => parsedProducts.find((product) => product.id === id)!;

const observation: LeapObservation = {
  handsUsed: 1,
  activeHand: "right",
  approachSide: "unknown",
  spanBand: "unknown",
  regraspObserved: false,
  trackingLossCount: 0,
};

describe("confirmed-use observation policy", () => {
  it("records a Leap observation without changing rules, preferences, or requirements", () => {
    const original = structuredClone(maya);
    const result = recordUseObservation(maya, observation);

    expect(result.shopper).toEqual(original);
    expect(result.shopper.rules).toEqual(original.rules);
    expect(result.shopper.preferences).toEqual(original.preferences);
    expect(result.shopper.confirmedUseRequirements).toEqual(original.confirmedUseRequirements);
    expect(result.shopper.preferredUseTraits).toEqual(original.preferredUseTraits);
    expect(result.pending).toEqual({ shopperId: "maya", observation });
  });

  it("adds one_hand_operation only after a required confirmation", () => {
    const result = confirmUseObservation(maya, observation, "required");

    expect(result.appliedRequirement).toBe("one_hand_operation");
    expect(result.shopper.confirmedUseRequirements).toContain("one_hand_operation");
    expect(result.shopper.preferredUseTraits).toEqual(maya.preferredUseTraits);
    expect(result.discarded).toBe(false);
  });

  it("adds only a preferred use trait after a preferred confirmation", () => {
    const result = confirmUseObservation(maya, observation, "preferred");

    expect(result.appliedPreference).toBe("one_hand_operation");
    expect(result.shopper.preferredUseTraits).toContain("one_hand_operation");
    expect(result.shopper.confirmedUseRequirements).toEqual(maya.confirmedUseRequirements);
    expect(result.shopper.rules).toEqual(maya.rules);
    expect(result.discarded).toBe(false);
  });

  it("discards incidental observations without adding evidence", () => {
    const result = confirmUseObservation(maya, observation, "incidental");

    expect(result.discarded).toBe(true);
    expect(result.appliedRequirement).toBeUndefined();
    expect(result.appliedPreference).toBeUndefined();
    expect(result.shopper).toEqual(maya);
  });
});

describe("substitution requirement policy", () => {
  const shoppersForEvaluation = profiles;

  it("pauses easy_press to basic_pump and names Maya and her exact requirement", () => {
    const request: SubstitutionEvaluationRequest = {
      missionId: "cabin-trip",
      currentProductId: "easy-press",
      replacementProductId: "basic-pump",
      savings: 18,
    };
    const result = evaluateSubstitution(
      request,
      productById("easy-press"),
      productById("basic-pump"),
      shoppersForEvaluation,
    );

    expect(result.decision).toBe("pause");
    expect(result.affectedShopperId).toBe("maya");
    expect(result.violatedRequirement).toBe("one_hand_operation");
    expect(result.message).toContain("Maya");
    expect(result.message).toContain("confirmed one-hand requirement");
    expect(result.actions).toContain("ask_maya");
  });

  it("allows the configured lower cost alternative fixture", () => {
    const fixture = substitutionFixtures.find((entry) => entry.name === "allowed_lower_cost_alternative")!;
    const request = fixture.request as SubstitutionEvaluationRequest;
    const result = evaluateSubstitution(
      request,
      productById(request.currentProductId),
      productById(request.replacementProductId),
      shoppersForEvaluation,
    );

    expect(result.decision).toBe("allow");
  });

  it("keeps a conflicting substitution paused unless explicit override approval is true", () => {
    const request: SubstitutionEvaluationRequest = {
      missionId: "cabin-trip",
      currentProductId: "easy-press",
      replacementProductId: "basic-pump",
      savings: 18,
      overrideApproved: false,
    };
    const paused = evaluateSubstitution(
      request,
      productById("easy-press"),
      productById("basic-pump"),
      shoppersForEvaluation,
    );

    expect(paused.decision).toBe("pause");

    const approved = evaluateSubstitution(
      { ...request, overrideApproved: true },
      productById("easy-press"),
      productById("basic-pump"),
      shoppersForEvaluation,
    );
    expect(approved.decision).toBe("allow");
    expect(approved.affectedShopperId).toBe("maya");
    expect(approved.violatedRequirement).toBe("one_hand_operation");
  });
});
