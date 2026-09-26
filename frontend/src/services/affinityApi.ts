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
import { createEngineApi, createHttpTransport, createLocalTransport, lazyTransport } from "./engineApi";
import { createMockApi } from "./mockApi";

/**
 * The only way UI code reaches Affinity's engine. Components call this adapter, never endpoints,
 * so the mock and HTTP implementations are interchangeable.
 *
 * The first nine methods are the interface from the Terminal 2 brief. Methods marked ADDITION are
 * needed by the UI but have no Terminal 1 endpoint yet; they're requested in the status file.
 */
export interface AffinityApi {
  /** mock = offline fixtures; core = Terminal 1's engine in the page; http = Terminal 1 over HTTP. */
  readonly mode: ApiMode;
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

export type ApiMode = "mock" | "core" | "http";

export interface ApiOptions {
  mode?: ApiMode;
  baseUrl?: string;
  /** Artificial latency for mock calls so loading states are visible; 0 in tests. */
  mockLatencyMs?: number;
}

const MODES: ApiMode[] = ["mock", "core", "http"];

/**
 * Mode comes from `?api=mock|core|http`, then VITE_AFFINITY_API, and defaults to core: Terminal 1's
 * real engine running in the page, which needs no network, backend server, or API key.
 */
export function resolveApiMode(search = typeof location === "undefined" ? "" : location.search): ApiMode {
  const fromQuery = new URLSearchParams(search).get("api") as ApiMode | null;
  if (fromQuery && MODES.includes(fromQuery)) return fromQuery;
  const fromEnv = import.meta.env?.VITE_AFFINITY_API as ApiMode | undefined;
  return fromEnv && MODES.includes(fromEnv) ? fromEnv : "core";
}

export function createAffinityApi(options: ApiOptions = {}): AffinityApi {
  const mode = options.mode ?? resolveApiMode();
  if (mode === "http") {
    // Default: the thin adapter the Vite dev server mounts over AffinityCoreService (see vite.config.ts).
    const baseUrl = options.baseUrl ?? import.meta.env?.VITE_AFFINITY_API_URL ?? "/api/core";
    return createEngineApi(createHttpTransport(baseUrl), "http");
  }
  if (mode === "core") return createEngineApi(lazyTransport(createLocalTransport), "core");
  return createMockApi({ latencyMs: options.mockLatencyMs ?? 250 });
}
