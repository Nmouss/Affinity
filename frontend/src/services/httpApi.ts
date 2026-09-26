import type { AffinityApi } from "./affinityApi";
import type { ShopperProfile } from "./contracts";

// HTTP implementation against the Terminal 1 API surface. Paths follow the Terminal 1 brief; request
// and response bodies are assumptions until the contract freeze and are listed in
// docs/affinity-experience-status.md. Methods without an endpoint yet delegate to the mock fixtures.
//
// Only stateless calls (mission parsing, voice interpretation) fall back to fixtures on failure,
// because the Terminal 1 brief guarantees fixture fallbacks for those. Stateful calls surface errors
// so the UI can offer Retry or a restart in mock mode instead of silently mixing data.

export function createHttpApi(
  baseUrl: string,
  fixtures: AffinityApi,
  onFallback?: (method: string, error: unknown) => void,
): AffinityApi {
  const root = baseUrl.replace(/\/$/, "");

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${root}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${method} ${path} failed with ${response.status}`);
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async function withFallback<T>(method: string, live: () => Promise<T>, fallback: () => Promise<T>) {
    try {
      return await live();
    } catch (error) {
      onFallback?.(method, error);
      return fallback();
    }
  }

  const post = <T>(path: string, body: unknown = {}) => call<T>("POST", path, body);
  const enc = encodeURIComponent;

  return {
    mode: "http",

    parseMission: (text) =>
      withFallback("parseMission", () => post("/missions/parse", { text }), () => fixtures.parseMission(text)),

    createMission: (draft) => post("/missions", draft),

    resolveParticipants: (missionId) => post(`/missions/${enc(missionId)}/participants`),

    async createShopper(input) {
      const shopper = await post<ShopperProfile>("/shoppers", input);
      await post(`/missions/${enc(input.missionId)}/shoppers`, { shopperId: shopper.id });
      return shopper;
    },

    submitComparison: (shopperId, input) => post(`/shoppers/${enc(shopperId)}/comparisons`, input),

    confirmShopper: (shopperId) => post(`/shoppers/${enc(shopperId)}/confirm`),

    addShopperRule: (shopperId, rule) => post(`/shoppers/${enc(shopperId)}/rules`, { rule }),

    recommend: (missionId) => post(`/missions/${enc(missionId)}/recommend`),

    interpretVoice: (transcript) =>
      withFallback(
        "interpretVoice",
        () => post("/voice/interpret", { transcript }),
        () => fixtures.interpretVoice(transcript),
      ),

    async submitUseObservation(shopperId, input) {
      // The observation is recorded first; only the user's classification changes the profile.
      await post(`/shoppers/${enc(shopperId)}/use-observations`, {
        productId: input.productId,
        observation: input.observation,
        source: input.source,
      });
      await post(`/shoppers/${enc(shopperId)}/use-requirements`, {
        productId: input.productId,
        observation: input.observation,
        classification: input.classification,
      });
    },

    evaluateSubstitution: (missionId, input) => post(`/missions/${enc(missionId)}/substitutions/evaluate`, input),

    // No Terminal 1 endpoints yet — requested in the status file.
    getShoppers: (missionId) => fixtures.getShoppers(missionId).catch(() => []),
    getComparisonPairs: (category) => fixtures.getComparisonPairs(category),
    getCatalog: (missionId) => fixtures.getCatalog(missionId),
  };
}
