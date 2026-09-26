import type { SubstitutionInput, SubstitutionResult, UseObservation } from "@/lib/mission/services/contracts";

export const pausedSubstitutionInput: Omit<SubstitutionInput, "missionId"> = {
  currentProductId: "easy_press",
  replacementProductId: "basic_pump",
  savings: 8,
};

export const compatibleSubstitutionInput: Omit<SubstitutionInput, "missionId"> = {
  currentProductId: "easy_press",
  replacementProductId: "compact_press",
  savings: 4,
};

export const pausedSubstitution: SubstitutionResult = {
  decision: "pause",
  affectedShopperId: "maya",
  violatedRequirement: "one_hand_operation",
  message: "This replacement conflicts with Maya’s confirmed one-hand requirement.",
  actions: ["choose_alternative", "ask_maya", "override_with_approval"],
};

export const allowedSubstitution: SubstitutionResult = {
  decision: "allow",
  message: "Compact Lever Press works one-handed and saves $4.",
  actions: [],
};

/** Observation the mock "Leap" returns when no hardware or recording is available. */
export const mockOneHandObservation: UseObservation = {
  handsUsed: 1,
  activeHand: "right",
  approachSide: "front",
  spanBand: "medium",
  regraspObserved: false,
  trackingLossCount: 0,
};
