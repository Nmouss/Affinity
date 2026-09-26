// LOCAL MOCK CONTRACTS — replace with imports from shared/types once Terminal 1 freezes them.
//
// The first block mirrors the "Shared contract to freeze first" section of the Terminal 1 brief
// verbatim. The second block holds request/response shapes the frontend needs that the brief names
// (MissionDraft, ParticipantResolution, ...) but does not define; each is listed as a contract
// assumption in docs/affinity-experience-status.md.

// ---- Mirrored from the Terminal 1 brief ----

export interface Mission {
  id: string;
  title: string;
  missionType: "group_trip_supplies" | "holiday_hosting" | "shared_home";
  sharedBudget: number;
  durationDays?: number;
  destination?: string;
  participantIds: string[];
  categories: string[];
  status: "draft" | "confirmed" | "shopping" | "approval";
}

export interface ShopperProfile {
  id: string;
  name: string;
  avatarId: string;
  category: string;
  preferences: Record<string, number>;
  evidenceCounts: Record<string, number>;
  rules: string[];
  preferredUseTraits: string[];
  confirmedUseRequirements: string[];
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  modelUrl?: string;
  imageUrl: string;
  attributes: Record<string, number>;
  facts: Record<string, string | number | boolean>;
  satisfies: Record<string, boolean>;
}

export interface Bundle {
  id: string;
  name: string;
  productIds: string[];
  totalPrice: number;
  attributes: Record<string, number>;
  satisfies: Record<string, boolean>;
  valueScore: number;
}

export interface IndividualScore {
  shopperId: string;
  bundleId: string;
  score: number;
  reasons: string[];
}

export interface Recommendation {
  selectedBundleId: string;
  eligibleBundleIds: string[];
  rejectedBundles: {
    bundleId: string;
    shopperId: string;
    violatedRequirement: string;
  }[];
  individualScores: IndividualScore[];
  groupScores: Record<string, number>;
  reasons: string[];
}

export type VoiceIntentName =
  | "create_mission"
  | "navigate_category"
  | "compare_products"
  | "filter_products"
  | "modify_cart"
  | "explain_decision"
  | "approve_action";

export interface VoiceIntent {
  transcript: string;
  intent: VoiceIntentName;
  entities: Record<string, string | number | string[]>;
  requiresConfirmation: boolean;
}

// ---- Frontend-side shapes pending Terminal 1 definitions ----

/** Output of POST /missions/parse (Terminal 1 brief, Deliverable 1). */
export interface MissionDraft {
  missionType: Mission["missionType"];
  title: string;
  destination?: string;
  durationDays?: number;
  participantNames: string[];
  sharedBudget: number;
  categories: string[];
  needsConfirmation: boolean;
  clarificationQuestion?: string;
}

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

/** Comparison definition (Terminal 1 brief, Deliverable 4). */
export interface ComparisonPair {
  pairId: string;
  axis: string;
  leftProductId: string;
  rightProductId: string;
  leftValue: number;
  rightValue: number;
  /** One-line description of the only intended difference, used by "Tell me the difference". */
  difference: string;
}

export type ComparisonChoice = "left" | "right" | "neither" | "skip";

export interface ComparisonInput {
  pairId: string;
  choice: ComparisonChoice;
  rejectionReason?: string;
}

/** Bounded Leap observation (Terminal 1 brief, Deliverable 8). */
export interface UseObservation {
  handsUsed: number;
  activeHand: "left" | "right" | "both" | "none";
  approachSide: "front" | "left" | "right" | "top" | "unknown";
  spanBand: "narrow" | "medium" | "wide" | "unknown";
  regraspObserved: boolean;
  trackingLossCount: number;
}

export type UseClassification = "required" | "preferred" | "incidental";

export interface UseObservationInput {
  productId: string;
  observation: UseObservation;
  classification: UseClassification;
  /** "live" or "recorded" — recorded sessions are never presented as live. */
  source: "live" | "recorded" | "manual";
}

export interface SubstitutionInput {
  missionId: string;
  currentProductId: string;
  replacementProductId: string;
  savings: number;
}

export type SubstitutionAction = "choose_alternative" | "override_with_approval" | `ask_${string}`;

export interface SubstitutionResult {
  decision: "allow" | "pause";
  affectedShopperId?: string;
  violatedRequirement?: string;
  message: string;
  actions: SubstitutionAction[];
}

/** Everything the mission space needs to render: products and bundles referenced by recommendations. */
export interface Catalog {
  products: Product[];
  bundles: Bundle[];
}
