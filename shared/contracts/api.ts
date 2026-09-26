import type {
  ComparisonChoice,
  ComparisonPair,
  LeapObservation,
  Mission,
  ObservationClassification,
  ParsedMission,
  Recommendation,
  ShopperProfile,
  SubstitutionEvaluation,
  SubstitutionEvaluationRequest,
  UseObservationResult,
  VoiceIntent,
} from "@/shared/types";

export interface MissionParseRequest {
  text: string;
}

export type MissionParseResponse = ParsedMission;

export interface CreateMissionRequest {
  mission: Mission;
}

export interface AddParticipantRequest {
  shopperId: string;
}

export interface CreateShopperRequest {
  shopper: ShopperProfile;
}

export interface AddRuleRequest {
  rule: string;
}

export interface ApplyComparisonRequest {
  pair: ComparisonPair;
  choice: ComparisonChoice;
  rejectionReason?: string;
}

export interface ConfirmUseObservationRequest {
  observation: LeapObservation;
  classification: ObservationClassification;
}

export interface RecommendRequest {
  shopperIds?: string[];
}

export interface VoiceInterpretRequest {
  transcript: string;
}

export interface CoreEndpointMap {
  "POST /missions/parse": { request: MissionParseRequest; response: MissionParseResponse };
  "POST /missions": { request: CreateMissionRequest; response: Mission };
  "GET /missions/:missionId": { request: { missionId: string }; response: Mission };
  "POST /missions/:missionId/participants": { request: AddParticipantRequest; response: Mission };
  "POST /missions/:missionId/shoppers": { request: AddParticipantRequest; response: Mission };
  "POST /shoppers": { request: CreateShopperRequest; response: ShopperProfile };
  "POST /shoppers/:shopperId/rules": { request: AddRuleRequest; response: ShopperProfile };
  "POST /shoppers/:shopperId/comparisons": { request: ApplyComparisonRequest; response: ShopperProfile };
  "POST /shoppers/:shopperId/confirm": { request: ConfirmUseObservationRequest; response: UseObservationResult };
  "POST /shoppers/:shopperId/use-observations": { request: { observation: LeapObservation }; response: { recorded: true } };
  "POST /shoppers/:shopperId/use-requirements": { request: ConfirmUseObservationRequest; response: UseObservationResult };
  "POST /shoppers/:shopperId/events": { request: { event: string; data: Record<string, unknown> }; response: { accepted: true } };
  "POST /voice/interpret": { request: VoiceInterpretRequest; response: VoiceIntent };
  "POST /missions/:missionId/recommend": { request: RecommendRequest; response: Recommendation };
  "POST /missions/:missionId/substitutions/evaluate": {
    request: SubstitutionEvaluationRequest;
    response: SubstitutionEvaluation;
  };
}

export type CoreEndpoint = keyof CoreEndpointMap;
