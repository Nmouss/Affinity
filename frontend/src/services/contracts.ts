// Contracts come from Terminal 1's frozen shared types (contract baseline aa84580). The aliases keep
// the names the frontend already uses; the second block holds adapter-level shapes that exist only on
// the UI side of the AffinityApi adapter.

import type {
  ComparisonPair as SharedComparisonPair,
  LeapObservation,
  ObservationClassification,
  ParsedMission,
  SubstitutionEvaluation,
  SubstitutionEvaluationRequest,
} from "@/shared/types";

export type {
  Bundle,
  ComparisonChoice,
  IndividualScore,
  Mission,
  Product,
  Recommendation,
  ShopperProfile,
  SubstitutionAction,
  VoiceIntent,
  VoiceIntentName,
} from "@/shared/types";

export type MissionDraft = ParsedMission;
export type UseObservation = LeapObservation;
export type UseClassification = ObservationClassification;
export type SubstitutionInput = SubstitutionEvaluationRequest;
export type SubstitutionResult = SubstitutionEvaluation;

/** A frozen comparison pair plus optional UI copy for "Tell me the difference". */
export type ComparisonPair = Omit<SharedComparisonPair, "axis"> & { axis: SharedComparisonPair["axis"] | string; difference?: string };

// ---- Adapter-level shapes (UI side only) ----

export interface ParticipantResolution {
  name: string;
  shopperId: string | null;
  status: "ready" | "missing";
}

export interface CreateShopperInput {
  missionId: string;
  name: string;
  avatarId: string;
  category: string;
  /** Rule id such as "no_fragile_glass"; null for "No rule". */
  rule: string | null;
}

export interface ComparisonInput {
  pairId: string;
  choice: import("@/shared/types").ComparisonChoice;
  rejectionReason?: string;
}

export interface UseObservationInput {
  productId: string;
  observation: UseObservation;
  classification: UseClassification;
  /** Recorded sessions are never presented as live. */
  source: "live" | "recorded" | "manual";
}

/** Products and bundles referenced by recommendations. */
export interface Catalog {
  products: import("@/shared/types").Product[];
  bundles: import("@/shared/types").Bundle[];
}
