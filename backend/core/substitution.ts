import type {
  Product,
  ShopperProfile,
  SubstitutionAction,
  SubstitutionEvaluation,
  SubstitutionEvaluationRequest,
} from "@/shared/types";

function friendlyRequirement(requirement: string): string {
  if (requirement === "one_hand_operation") return "one-hand requirement";
  return requirement.replaceAll("_", " ");
}

export function evaluateSubstitution(
  request: SubstitutionEvaluationRequest,
  currentProduct: Product,
  replacementProduct: Product,
  shoppers: ShopperProfile[],
): SubstitutionEvaluation {
  if (currentProduct.id !== request.currentProductId) throw new Error("Current product does not match request");
  if (replacementProduct.id !== request.replacementProductId) throw new Error("Replacement product does not match request");
  const actualSavings = Math.round((currentProduct.price - replacementProduct.price) * 100) / 100;
  if (Math.abs(actualSavings - request.savings) > 0.001) throw new Error("Claimed savings do not match product prices");

  const conflict = shoppers
    .flatMap((shopper) => [
      ...shopper.rules.map((requirement) => ({ shopper, requirement, source: "rule" as const })),
      ...shopper.confirmedUseRequirements.map((requirement) => ({
        shopper,
        requirement,
        source: "confirmed" as const,
      })),
    ])
    .find(({ requirement }) => replacementProduct.satisfies[requirement] !== true);

  if (!conflict) {
    return {
      decision: "allow",
      message: `The replacement saves $${actualSavings.toFixed(2)} and preserves every rule and confirmed requirement.`,
      actions: [],
    };
  }

  if (request.overrideApproved === true) {
    return {
      decision: "allow",
      affectedShopperId: conflict.shopper.id,
      violatedRequirement: conflict.requirement,
      message: `Explicit approval overrides ${conflict.shopper.name}'s ${friendlyRequirement(conflict.requirement)}.`,
      actions: [],
    };
  }

  const actions: SubstitutionAction[] = [
    "choose_alternative",
    `ask_${conflict.shopper.id}`,
    "override_with_approval",
  ];
  return {
    decision: "pause",
    affectedShopperId: conflict.shopper.id,
    violatedRequirement: conflict.requirement,
    message:
      conflict.source === "confirmed"
        ? `This replacement conflicts with ${conflict.shopper.name}'s confirmed ${friendlyRequirement(conflict.requirement)}.`
        : `This replacement conflicts with ${conflict.shopper.name}'s ${friendlyRequirement(conflict.requirement)} rule.`,
    actions,
  };
}
