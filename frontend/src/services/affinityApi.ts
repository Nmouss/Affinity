import type {
  Catalog,
  ComparisonInput,
  ComparisonPair,
  CreateShopperInput,
  Mission,
  MissionDraft,
  ParticipantResolution,
  Recommendation,
  ShopperProfile,
  SubstitutionInput,
  SubstitutionResult,
  UseObservationInput,
  VoiceIntent,
} from "./contracts";
import { createHttpApi } from "./httpApi";
import { createMockApi } from "./mockApi";

/**
 * The only way UI code reaches Affinity's engine. Components call this adapter, never endpoints,
 * so the mock and HTTP implementations are interchangeable.
 *
 * The first nine methods are the interface from the Terminal 2 brief. Methods marked ADDITION are
 * needed by the UI but have no Terminal 1 endpoint yet; they're requested in the status file.
 */
export interface AffinityApi {
  readonly mode: "mock" | "http";
  parseMission(text: string): Promise<MissionDraft>;
  createMission(draft: MissionDraft): Promise<Mission>;
  resolveParticipants(missionId: string): Promise<ParticipantResolution[]>;
  createShopper(input: CreateShopperInput): Promise<ShopperProfile>;
  submitComparison(shopperId: string, input: ComparisonInput): Promise<ShopperProfile>;
  recommend(missionId: string): Promise<Recommendation>;
  interpretVoice(transcript: string): Promise<VoiceIntent>;
  submitUseObservation(shopperId: string, input: UseObservationInput): Promise<void>;
  evaluateSubstitution(missionId: string, input: SubstitutionInput): Promise<SubstitutionResult>;

  /** ADDITION: POST /shoppers/:id/confirm — saves confirmed traits only. */
  confirmShopper(shopperId: string): Promise<ShopperProfile>;
  /** ADDITION: POST /shoppers/:id/rules — only called after the user confirms a rule change. */
  addShopperRule(shopperId: string, rule: string): Promise<ShopperProfile>;
  /** ADDITION: no endpoint yet — profiles of everyone in the mission, for names and reactions. */
  getShoppers(missionId: string): Promise<ShopperProfile[]>;
  /** ADDITION: no endpoint yet — the four quick-choice pairs for a shopping category. */
  getComparisonPairs(category: string): Promise<ComparisonPair[]>;
  /** ADDITION: no endpoint yet — products and bundles referenced by recommendations. */
  getCatalog(missionId: string): Promise<Catalog>;
}

export interface ApiOptions {
  mode?: "mock" | "http";
  baseUrl?: string;
  /** Artificial latency for mock calls so loading states are visible; 0 in tests. */
  mockLatencyMs?: number;
  /** Called when an HTTP call fell back to its fixture response. */
  onFallback?: (method: string, error: unknown) => void;
}

/** Mode comes from `?api=http|mock`, then VITE_AFFINITY_API, and defaults to mock. */
export function resolveApiMode(search = typeof location === "undefined" ? "" : location.search): "mock" | "http" {
  const fromQuery = new URLSearchParams(search).get("api");
  if (fromQuery === "http" || fromQuery === "mock") return fromQuery;
  return import.meta.env?.VITE_AFFINITY_API === "http" ? "http" : "mock";
}

export function createAffinityApi(options: ApiOptions = {}): AffinityApi {
  const mode = options.mode ?? resolveApiMode();
  if (mode === "http") {
    const baseUrl = options.baseUrl ?? import.meta.env?.VITE_AFFINITY_API_URL ?? "http://localhost:8000";
    return createHttpApi(baseUrl, createMockApi({ latencyMs: 0 }), options.onFallback);
  }
  return createMockApi({ latencyMs: options.mockLatencyMs ?? 250 });
}
