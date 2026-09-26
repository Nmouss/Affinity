export type MissionType = "group_trip_supplies" | "holiday_hosting" | "shared_home";
export type MissionStatus = "draft" | "confirmed" | "shopping" | "approval";
export type TasteAxis = "durability" | "compactness" | "simpleControls" | "expressiveStyle";
export type ComparisonChoice = "left" | "right" | "neither" | "skip";

export interface Mission {
  id: string;
  title: string;
  missionType: MissionType;
  sharedBudget: number;
  durationDays?: number;
  destination?: string;
  participantIds: string[];
  categories: string[];
  status: MissionStatus;
}

export interface ParsedMission {
  missionType?: MissionType;
  title: string;
  destination?: string;
  durationDays?: number;
  participantNames: string[];
  sharedBudget?: number;
  categories: string[];
  needsConfirmation: boolean;
  clarificationQuestion?: string;
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

export interface ComparisonPair {
  pairId: string;
  axis: TasteAxis;
  leftProductId: string;
  rightProductId: string;
  leftValue: number;
  rightValue: number;
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

export interface RejectedBundle {
  bundleId: string;
  shopperId: string;
  violatedRequirement: string;
}

export interface Recommendation {
  selectedBundleId: string;
  eligibleBundleIds: string[];
  rejectedBundles: RejectedBundle[];
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

export type VoiceEntityValue = string | number | string[];

export interface VoiceIntent {
  transcript: string;
  intent: VoiceIntentName;
  entities: Record<string, VoiceEntityValue>;
  requiresConfirmation: boolean;
}

export interface LeapObservation {
  handsUsed: number;
  activeHand: "left" | "right" | "both" | "unknown";
  approachSide: "front" | "left" | "right" | "top" | "unknown";
  spanBand: "small" | "medium" | "large" | "unknown";
  regraspObserved: boolean;
  trackingLossCount: number;
}

export type ObservationClassification = "required" | "preferred" | "incidental";

export interface UseObservationResult {
  shopper: ShopperProfile;
  appliedRequirement?: string;
  appliedPreference?: string;
  discarded: boolean;
}

export interface SubstitutionEvaluationRequest {
  missionId: string;
  currentProductId: string;
  replacementProductId: string;
  savings: number;
  overrideApproved?: boolean;
}

export interface SubstitutionEvaluation {
  decision: "allow" | "pause";
  affectedShopperId?: string;
  violatedRequirement?: string;
  message: string;
  actions: Array<"choose_alternative" | "ask_shopper" | "override_with_approval">;
}
