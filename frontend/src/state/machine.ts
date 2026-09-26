import type {
  Catalog,
  ComparisonChoice,
  ComparisonPair,
  Mission,
  MissionDraft,
  ParticipantResolution,
  Recommendation,
  ShopperProfile,
  SubstitutionResult,
  UseClassification,
  UseObservation,
  VoiceIntent,
} from "../services/contracts";

// The single source of truth for which screen is showing. Screens change only through GO, and GO is
// rejected unless the transition table allows it, so the current screen is never inferred from flags.

export const SCREENS = [
  "HOME",
  "TRANSCRIPT_CONFIRMATION",
  "MISSION_BRIEF",
  "PARTICIPANT_RESOLUTION",
  "SHOPPER_CREATION",
  "QUICK_CHOICES",
  "PROFILE_CONFIRMATION",
  "MISSION_SPACE",
  "LEAP_CHECK",
  "SUBSTITUTION_APPROVAL",
  "COMPLETE",
] as const;

export type Screen = (typeof SCREENS)[number];

export const TRANSITIONS: Record<Screen, readonly Screen[]> = {
  HOME: ["TRANSCRIPT_CONFIRMATION", "MISSION_BRIEF"], // voice → transcript; typed text → brief
  TRANSCRIPT_CONFIRMATION: ["HOME", "MISSION_BRIEF"],
  MISSION_BRIEF: ["HOME", "PARTICIPANT_RESOLUTION"],
  PARTICIPANT_RESOLUTION: ["MISSION_BRIEF", "SHOPPER_CREATION", "MISSION_SPACE"],
  SHOPPER_CREATION: ["PARTICIPANT_RESOLUTION", "QUICK_CHOICES"],
  QUICK_CHOICES: ["SHOPPER_CREATION", "PROFILE_CONFIRMATION"],
  PROFILE_CONFIRMATION: ["SHOPPER_CREATION", "MISSION_SPACE"],
  MISSION_SPACE: ["LEAP_CHECK", "SUBSTITUTION_APPROVAL", "COMPLETE"],
  LEAP_CHECK: ["MISSION_SPACE", "SUBSTITUTION_APPROVAL"],
  SUBSTITUTION_APPROVAL: ["MISSION_SPACE", "COMPLETE"],
  COMPLETE: ["HOME"],
};

export const canTransition = (from: Screen, to: Screen) => TRANSITIONS[from].includes(to);

/** Which mission-space panel is in focus. One value, not a set of booleans. */
export type SpacePanel = "cart" | "decision" | "compare" | "explain";

export interface ChoiceFeedback {
  pairId: string;
  choice: ComparisonChoice;
  /** Axis whose evidence count grew, or null when nothing was learned (Skip / Neither). */
  learnedAxis: string | null;
  direction: 1 | -1 | 0;
}

export type LeapPhase = "offer" | "capturing" | "observed" | "saved";

export interface LeapCheckState {
  productId: string;
  phase: LeapPhase;
  source: "live" | "recorded" | "manual" | null;
  observation: UseObservation | null;
  classification: UseClassification | null;
}

export type SubstitutionStatus = "paused" | "asked" | "alternative_approved" | "overridden" | "allowed";

export interface SubstitutionState {
  currentProductId: string;
  replacementProductId: string;
  savings: number;
  result: SubstitutionResult;
  status: SubstitutionStatus;
}

/** A consequential action waiting on an explicit Confirm. */
export type PendingConfirmation =
  | { kind: "add_rule"; rule: string; transcript: string; material: string }
  | { kind: "mission_change"; field: string; value?: number; transcript: string }
  | { kind: "request_approval"; transcript: string }
  | { kind: "override_substitution" };

export interface UndoToast {
  id: number;
  message: string;
  previousCartIds: string[];
}

export interface VoiceLogEntry {
  transcript: string;
  response: string;
}

export interface AppState {
  screen: Screen;
  busy: string | null;
  error: string | null;
  notice: string | null;

  transcript: string;
  transcriptSource: "live" | "demo" | null;
  draft: MissionDraft | null;
  mission: Mission | null;
  participants: ParticipantResolution[];
  shoppers: ShopperProfile[];
  inviteSentTo: string | null;

  shopper: ShopperProfile | null;
  pairs: ComparisonPair[];
  choiceIndex: number;
  choices: ChoiceFeedback[];

  catalog: Catalog | null;
  recommendationBefore: Recommendation | null;
  recommendationAfter: Recommendation | null;

  panel: SpacePanel;
  activeCategory: string | null;
  selectedProductId: string | null;
  compareIds: [string, string] | null;
  explanation: { shopperId: string; lines: string[] } | null;
  cartIds: string[];
  hiddenMaterials: string[];
  leapOfferDismissed: boolean;

  leapCheck: LeapCheckState | null;
  substitution: SubstitutionState | null;
  pending: PendingConfirmation | null;
  undo: UndoToast | null;
  voiceLog: VoiceLogEntry[];
  approvalRequested: boolean;
}

export const initialState: AppState = {
  screen: "HOME",
  busy: null,
  error: null,
  notice: null,
  transcript: "",
  transcriptSource: null,
  draft: null,
  mission: null,
  participants: [],
  shoppers: [],
  inviteSentTo: null,
  shopper: null,
  pairs: [],
  choiceIndex: 0,
  choices: [],
  catalog: null,
  recommendationBefore: null,
  recommendationAfter: null,
  panel: "cart",
  activeCategory: null,
  selectedProductId: null,
  compareIds: null,
  explanation: null,
  cartIds: [],
  hiddenMaterials: [],
  leapOfferDismissed: false,
  leapCheck: null,
  substitution: null,
  pending: null,
  undo: null,
  voiceLog: [],
  approvalRequested: false,
};

export type Action =
  | { type: "GO"; screen: Screen }
  | { type: "RESET" }
  | { type: "BUSY"; label: string | null }
  | { type: "ERROR"; message: string | null }
  | { type: "NOTICE"; message: string | null }
  | { type: "SET_TRANSCRIPT"; transcript: string; source?: "live" | "demo" }
  | { type: "SET_DRAFT"; draft: MissionDraft }
  | { type: "MISSION_CREATED"; mission: Mission; participants: ParticipantResolution[]; shoppers: ShopperProfile[]; catalog: Catalog; before: Recommendation }
  | { type: "INVITE_SENT"; name: string }
  | { type: "SHOPPER_CREATED"; shopper: ShopperProfile; pairs: ComparisonPair[] }
  | { type: "CHOICE_RECORDED"; shopper: ShopperProfile; feedback: ChoiceFeedback }
  | { type: "ENTER_SPACE"; shopper: ShopperProfile | null; shoppers: ShopperProfile[]; after: Recommendation | null }
  | { type: "RECOMMENDATION_UPDATED"; after: Recommendation; shopper?: ShopperProfile }
  | { type: "PANEL"; panel: SpacePanel }
  | { type: "CATEGORY"; category: string | null }
  | { type: "SELECT_PRODUCT"; productId: string | null }
  | { type: "COMPARE"; ids: [string, string] | null }
  | { type: "EXPLAIN"; shopperId: string; lines: string[] }
  | { type: "SET_CART"; cartIds: string[]; undoMessage?: string }
  | { type: "UNDO" }
  | { type: "DISMISS_UNDO" }
  | { type: "HIDE_MATERIAL"; material: string }
  | { type: "DISMISS_LEAP_OFFER" }
  | { type: "LEAP_START"; productId: string }
  | { type: "LEAP_CAPTURING"; source: "live" | "recorded" | "manual" }
  | { type: "LEAP_OBSERVED"; observation: UseObservation; source: "live" | "recorded" | "manual" }
  | { type: "LEAP_CLASSIFIED"; classification: UseClassification }
  | { type: "SUBSTITUTION"; substitution: SubstitutionState }
  | { type: "SUBSTITUTION_STATUS"; status: SubstitutionStatus; cartIds?: string[] }
  | { type: "CONFIRM_REQUEST"; pending: PendingConfirmation }
  | { type: "CONFIRM_CLEAR" }
  | { type: "VOICE_LOG"; entry: VoiceLogEntry }
  | { type: "APPROVAL_REQUESTED" };

let toastId = 0;

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "GO":
      if (!canTransition(state.screen, action.screen)) {
        console.warn(`Blocked transition ${state.screen} → ${action.screen}`);
        return state;
      }
      return { ...state, screen: action.screen, error: null, busy: null };
    case "RESET":
      return initialState;
    case "BUSY":
      return { ...state, busy: action.label, error: action.label ? null : state.error };
    case "ERROR":
      return { ...state, error: action.message, busy: null };
    case "NOTICE":
      return { ...state, notice: action.message };
    case "SET_TRANSCRIPT":
      return { ...state, transcript: action.transcript, transcriptSource: action.source ?? state.transcriptSource };
    case "SET_DRAFT":
      return { ...state, draft: action.draft };
    case "MISSION_CREATED":
      return {
        ...state,
        mission: action.mission,
        participants: action.participants,
        shoppers: action.shoppers,
        catalog: action.catalog,
        recommendationBefore: action.before,
      };
    case "INVITE_SENT":
      return { ...state, inviteSentTo: action.name };
    case "SHOPPER_CREATED":
      return { ...state, shopper: action.shopper, pairs: action.pairs, choiceIndex: 0, choices: [] };
    case "CHOICE_RECORDED":
      return {
        ...state,
        shopper: action.shopper,
        choices: [...state.choices, action.feedback],
        choiceIndex: state.choiceIndex + 1,
      };
    case "ENTER_SPACE": {
      const current = action.after ?? state.recommendationBefore;
      const bundle = state.catalog?.bundles.find((b) => b.id === current?.selectedBundleId);
      return {
        ...state,
        shopper: action.shopper ?? state.shopper,
        shoppers: action.shoppers.length ? action.shoppers : state.shoppers,
        recommendationAfter: action.after,
        cartIds: bundle ? [...bundle.productIds] : [],
        panel: action.after ? "decision" : "cart",
      };
    }
    case "RECOMMENDATION_UPDATED": {
      const bundle = state.catalog?.bundles.find((b) => b.id === action.after.selectedBundleId);
      return {
        ...state,
        recommendationAfter: action.after,
        shopper: action.shopper ?? state.shopper,
        cartIds: bundle ? [...bundle.productIds] : state.cartIds,
      };
    }
    case "PANEL":
      return { ...state, panel: action.panel };
    case "CATEGORY":
      return { ...state, activeCategory: action.category, panel: "cart" };
    case "SELECT_PRODUCT":
      return { ...state, selectedProductId: action.productId };
    case "COMPARE":
      return { ...state, compareIds: action.ids, panel: action.ids ? "compare" : "cart" };
    case "EXPLAIN":
      return { ...state, explanation: { shopperId: action.shopperId, lines: action.lines }, panel: "explain" };
    case "SET_CART":
      return {
        ...state,
        cartIds: action.cartIds,
        undo: action.undoMessage
          ? { id: ++toastId, message: action.undoMessage, previousCartIds: state.cartIds }
          : state.undo,
      };
    case "UNDO":
      return state.undo ? { ...state, cartIds: state.undo.previousCartIds, undo: null } : state;
    case "DISMISS_UNDO":
      return { ...state, undo: null };
    case "HIDE_MATERIAL":
      return state.hiddenMaterials.includes(action.material)
        ? state
        : { ...state, hiddenMaterials: [...state.hiddenMaterials, action.material] };
    case "DISMISS_LEAP_OFFER":
      return { ...state, leapOfferDismissed: true };
    case "LEAP_START":
      return {
        ...state,
        leapCheck: { productId: action.productId, phase: "offer", source: null, observation: null, classification: null },
      };
    case "LEAP_CAPTURING":
      return state.leapCheck ? { ...state, leapCheck: { ...state.leapCheck, phase: "capturing", source: action.source } } : state;
    case "LEAP_OBSERVED":
      return state.leapCheck
        ? { ...state, leapCheck: { ...state.leapCheck, phase: "observed", observation: action.observation, source: action.source } }
        : state;
    case "LEAP_CLASSIFIED":
      return state.leapCheck
        ? { ...state, leapCheck: { ...state.leapCheck, phase: "saved", classification: action.classification } }
        : state;
    case "SUBSTITUTION":
      return { ...state, substitution: action.substitution };
    case "SUBSTITUTION_STATUS":
      return state.substitution
        ? { ...state, substitution: { ...state.substitution, status: action.status }, cartIds: action.cartIds ?? state.cartIds }
        : state;
    case "CONFIRM_REQUEST":
      return { ...state, pending: action.pending };
    case "CONFIRM_CLEAR":
      return { ...state, pending: null };
    case "VOICE_LOG":
      return { ...state, voiceLog: [...state.voiceLog.slice(-4), action.entry] };
    case "APPROVAL_REQUESTED":
      return { ...state, approvalRequested: true };
  }
}

/** Frontend policy for a typed voice intent (Terminal 2 brief, "Voice inside the mission"). */
export type IntentHandling = "immediate" | "undo" | "confirm" | "confirm_always";

export function handlingFor(intent: VoiceIntent): IntentHandling {
  if (intent.intent === "approve_action") return "confirm_always";
  const e = intent.entities;
  // Rule, budget, and participant changes always confirm, even if the engine didn't flag them.
  const changesMission = ["missionField", "proposedRule", "excludedMaterial", "sharedBudget", "participantNames", "rule", "rules"].some((k) => k in e);
  if (intent.requiresConfirmation || changesMission) return "confirm";
  if (intent.intent === "modify_cart") return "undo";
  return "immediate";
}
