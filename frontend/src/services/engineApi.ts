import type {
  AddParticipantRequest,
  AddRuleRequest,
  ApplyComparisonRequest,
  ConfirmUseObservationRequest,
  CreateMissionRequest,
  CreateShopperRequest,
  MissionParseRequest,
  RecommendRequest,
  VoiceInterpretRequest,
} from "@/shared/contracts";
import bundlesJson from "@/shared/data/bundles.json";
import comparisonsJson from "@/shared/data/comparisons.json";
import productsJson from "@/shared/data/products.json";
import shoppersJson from "@/shared/data/shoppers.json";
import type {
  Bundle,
  Mission,
  ParsedMission,
  Product,
  Recommendation,
  ShopperProfile,
  SubstitutionEvaluation,
  SubstitutionEvaluationRequest,
  UseObservationResult,
  VoiceIntent,
} from "@/shared/types";
import type { AffinityApi } from "./affinityApi";
import type { ComparisonPair, MissionDraft } from "./contracts";

// AffinityApi over Terminal 1's engine. The transport mirrors AffinityCoreService one-to-one, so the
// same adapter runs against the in-browser service ("core" mode) or its HTTP endpoints ("http" mode).
// All decisions — parsing, taste updates, eligibility, scoring, substitution policy — happen in the
// engine. This file only builds request DTOs and keeps a display cache of profiles.

export interface CoreTransport {
  parseMission(request: MissionParseRequest): Promise<ParsedMission>;
  createMission(request: CreateMissionRequest): Promise<Mission>;
  getMission(missionId: string): Promise<Mission>;
  addParticipant(missionId: string, request: AddParticipantRequest): Promise<Mission>;
  createShopper(request: CreateShopperRequest): Promise<ShopperProfile>;
  addShopperRule(shopperId: string, request: AddRuleRequest): Promise<ShopperProfile>;
  applyComparison(shopperId: string, request: ApplyComparisonRequest): Promise<ShopperProfile>;
  recordUseObservation(shopperId: string, request: { observation: unknown }): Promise<{ recorded: true }>;
  confirmUseObservation(shopperId: string, request: ConfirmUseObservationRequest): Promise<UseObservationResult>;
  interpretVoice(request: VoiceInterpretRequest): Promise<VoiceIntent>;
  recommend(missionId: string, request?: RecommendRequest): Promise<Recommendation>;
  evaluateSubstitution(missionId: string, request: SubstitutionEvaluationRequest): Promise<SubstitutionEvaluation>;
}

/** Runs Terminal 1's AffinityCoreService in the page: the real engine with no network at all. */
export async function createLocalTransport(): Promise<CoreTransport> {
  const { AffinityCoreService } = await import("@/backend/service");
  const service = new AffinityCoreService();
  return {
    parseMission: (r) => service.parseMission(r),
    createMission: async (r) => service.createMission(r),
    getMission: async (id) => service.getMission(id),
    addParticipant: async (id, r) => service.addParticipant(id, r),
    createShopper: async (r) => service.createShopper(r),
    addShopperRule: async (id, r) => service.addShopperRule(id, r),
    applyComparison: async (id, r) => service.applyShopperComparison(id, r),
    recordUseObservation: async (id, r) => service.recordShopperUseObservation(id, r),
    confirmUseObservation: async (id, r) => service.confirmShopperUseObservation(id, r),
    interpretVoice: (r) => service.interpretVoice(r),
    recommend: async (id, r) => service.recommend(id, r),
    evaluateSubstitution: async (id, r) => service.evaluateSubstitution(id, r),
  };
}

/** Lets the adapter be created synchronously while the engine module loads. */
export function lazyTransport(load: () => Promise<CoreTransport>): CoreTransport {
  let ready: Promise<CoreTransport> | null = null;
  const get = () => (ready ??= load());
  return new Proxy({} as CoreTransport, {
    get: (_target, method: keyof CoreTransport) =>
      async (...args: unknown[]) => ((await get())[method] as (...a: unknown[]) => Promise<unknown>)(...args),
  });
}

/** Terminal 1's endpoint map (shared/contracts/api.ts) over fetch. */
export function createHttpTransport(baseUrl: string): CoreTransport {
  const root = baseUrl.replace(/\/$/, "");
  const enc = encodeURIComponent;
  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${root}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} → ${response.status}${text ? `: ${text}` : ""}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }
  const post = <T>(path: string, body: unknown = {}) => call<T>("POST", path, body);
  return {
    parseMission: (r) => post("/missions/parse", r),
    createMission: (r) => post("/missions", r),
    getMission: (id) => call("GET", `/missions/${enc(id)}`),
    addParticipant: (id, r) => post(`/missions/${enc(id)}/participants`, r),
    createShopper: (r) => post("/shoppers", r),
    addShopperRule: (id, r) => post(`/shoppers/${enc(id)}/rules`, r),
    applyComparison: (id, r) => post(`/shoppers/${enc(id)}/comparisons`, r),
    recordUseObservation: (id, r) => post(`/shoppers/${enc(id)}/use-observations`, r),
    confirmUseObservation: (id, r) => post(`/shoppers/${enc(id)}/use-requirements`, r),
    interpretVoice: (r) => post("/voice/interpret", r),
    recommend: (id, r = {}) => post(`/missions/${enc(id)}/recommend`, r),
    evaluateSubstitution: (id, r) => post(`/missions/${enc(id)}/substitutions/evaluate`, r),
  };
}

/** UI copy for "Tell me the difference", keyed by Terminal 1 pair id. Display text only. */
const PAIR_DIFFERENCES: Record<string, string> = {
  "durability-01": "The left is an insulated stainless mug built to take knocks; the right is a lighter glass-and-plastic pump brewer.",
  "compactness-01": "The left packs down small with one press; the right is a larger classic press with a glass carafe.",
  "controls-01": "The left has a single press control; the right uses a multi-mode dial.",
  "style-01": "The left comes in a bold coral-and-cobalt finish; the right is a plain steel mug.",
};

const blankAxes = () => ({ durability: 0, compactness: 0, simpleControls: 0, expressiveStyle: 0 });
const slug = (text: string) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mission";

export function createEngineApi(transport: CoreTransport, mode: "core" | "http"): AffinityApi {
  const products = productsJson as unknown as Product[];
  const bundles = bundlesJson as unknown as Bundle[];
  const pairs: ComparisonPair[] = (comparisonsJson as unknown as ComparisonPair[]).map((p) => ({ ...p, difference: PAIR_DIFFERENCES[p.pairId] }));
  // Display cache: every profile the engine has returned, seeded from the same fixtures it seeds from.
  const profiles = new Map<string, ShopperProfile>((shoppersJson as unknown as ShopperProfile[]).map((s) => [s.id, s]));
  const missionNames = new Map<string, string[]>();
  const pendingJoin = new Map<string, string>(); // shopperId → missionId, joined on profile confirmation
  const remember = (profile: ShopperProfile) => (profiles.set(profile.id, profile), profile);
  const byName = (name: string) => [...profiles.values()].find((p) => p.name.toLowerCase() === name.trim().toLowerCase());

  return {
    mode,

    parseMission: (text) => transport.parseMission({ text }),

    async createMission(draft: MissionDraft) {
      if (!draft.missionType || draft.sharedBudget === undefined) throw new Error("The mission needs a type and a budget.");
      const participantIds = draft.participantNames.map((n) => byName(n)?.id).filter((id): id is string => Boolean(id));
      const mission = await transport.createMission({
        mission: {
          id: `${slug(draft.title)}-${Date.now().toString(36)}`,
          title: draft.title,
          missionType: draft.missionType,
          sharedBudget: draft.sharedBudget,
          durationDays: draft.durationDays,
          destination: draft.destination,
          participantIds: [...new Set(participantIds)],
          categories: draft.categories,
          status: "confirmed",
        },
      });
      missionNames.set(mission.id, draft.participantNames);
      return mission;
    },

    async resolveParticipants(missionId) {
      const mission = await transport.getMission(missionId);
      const names = missionNames.get(missionId) ?? mission.participantIds.map((id) => profiles.get(id)?.name ?? id);
      return names.map((name) => {
        const profile = byName(name);
        const ready = Boolean(profile && mission.participantIds.includes(profile.id));
        return { name, shopperId: ready ? profile!.id : null, status: ready ? ("ready" as const) : ("missing" as const) };
      });
    },

    async createShopper(input) {
      // The demo guest is "judge", matching Terminal 1's fixtures; the engine replaces its seed profile.
      const profile = await transport.createShopper({
        shopper: {
          id: "judge",
          name: input.name.trim() || "Guest",
          avatarId: input.avatarId,
          category: input.category,
          preferences: blankAxes(),
          evidenceCounts: blankAxes(),
          rules: input.rule ? [input.rule] : [],
          preferredUseTraits: [],
          confirmedUseRequirements: [],
        },
      });
      pendingJoin.set(profile.id, input.missionId);
      const names = missionNames.get(input.missionId);
      if (names) {
        const guest = names.findIndex((n) => /guest/i.test(n) || !byName(n));
        if (guest >= 0) names[guest] = profile.name;
      }
      return remember(profile);
    },

    async submitComparison(shopperId, input) {
      const pair = pairs.find((p) => p.pairId === input.pairId);
      if (!pair) throw new Error(`Unknown comparison ${input.pairId}`);
      const { difference: _ui, ...frozenPair } = pair;
      return remember(
        await transport.applyComparison(shopperId, {
          pair: frozenPair as ApplyComparisonRequest["pair"],
          choice: input.choice,
          rejectionReason: input.rejectionReason,
        }),
      );
    },

    async confirmShopper(shopperId) {
      // Confirming the profile is when the guest's shopper joins the group decision.
      const missionId = pendingJoin.get(shopperId);
      if (missionId) {
        await transport.addParticipant(missionId, { shopperId });
        pendingJoin.delete(shopperId);
      }
      const profile = profiles.get(shopperId);
      if (!profile) throw new Error(`Unknown shopper ${shopperId}`);
      return profile;
    },

    addShopperRule: async (shopperId, rule) => remember(await transport.addShopperRule(shopperId, { rule })),

    recommend: (missionId) => transport.recommend(missionId),

    interpretVoice: (transcript) => transport.interpretVoice({ transcript }),

    async submitUseObservation(shopperId, input) {
      await transport.recordUseObservation(shopperId, { observation: input.observation });
      const result = await transport.confirmUseObservation(shopperId, {
        observation: input.observation,
        classification: input.classification,
      });
      remember(result.shopper);
    },

    evaluateSubstitution: (missionId, input) => transport.evaluateSubstitution(missionId, { ...input, missionId }),

    async getShoppers(missionId) {
      const mission = await transport.getMission(missionId);
      return mission.participantIds.map((id) => profiles.get(id)).filter((p): p is ShopperProfile => Boolean(p));
    },

    getComparisonPairs: async (category) => pairs.filter((p) => products.find((x) => x.id === p.leftProductId)?.category === category),

    getCatalog: async () => ({ products, bundles }),
  };
}
