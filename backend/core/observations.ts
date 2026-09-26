import type {
  LeapObservation,
  ObservationClassification,
  ShopperProfile,
  UseObservationResult,
} from "@/shared/types";

export interface PendingUseObservation {
  shopperId: string;
  observation: LeapObservation;
}

export function recordUseObservation(
  profile: ShopperProfile,
  observation: LeapObservation,
): { shopper: ShopperProfile; pending: PendingUseObservation } {
  return {
    shopper: structuredClone(profile),
    pending: { shopperId: profile.id, observation: structuredClone(observation) },
  };
}

function confirmedTrait(observation: LeapObservation): string | undefined {
  if (observation.handsUsed === 1) return "one_hand_operation";
  if (observation.handsUsed === 2) return "two_hand_operation";
  if (observation.approachSide !== "unknown") return `${observation.approachSide}_approach`;
  if (observation.spanBand !== "unknown") return `${observation.spanBand}_span`;
  return undefined;
}

export function confirmUseObservation(
  profile: ShopperProfile,
  observation: LeapObservation,
  classification: ObservationClassification,
): UseObservationResult {
  const shopper = structuredClone(profile);
  if (classification === "incidental") return { shopper, discarded: true };

  const trait = confirmedTrait(observation);
  if (!trait) return { shopper, discarded: true };

  if (classification === "required") {
    if (!shopper.confirmedUseRequirements.includes(trait)) shopper.confirmedUseRequirements.push(trait);
    return { shopper, appliedRequirement: trait, discarded: false };
  }

  if (!shopper.preferredUseTraits.includes(trait)) shopper.preferredUseTraits.push(trait);
  return { shopper, appliedPreference: trait, discarded: false };
}
