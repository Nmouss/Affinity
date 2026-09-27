import { beforeEach, describe, expect, it } from "vitest";
import type { TasteProfile } from "@/lib/taste/types";

// Same in-memory localStorage stand-in as roster.test.ts: the store checks for the global at call time.
function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string): string | null => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string): void => void data.set(key, value),
    removeItem: (key: string): void => void data.delete(key),
    raw: data,
  };
}

const memoryStorage = createMemoryStorage();
(globalThis as unknown as { localStorage: unknown }).localStorage = memoryStorage;

const { useRoster, getTasteProfile, ROSTER_SCHEMA_VERSION } = await import("@/lib/people/roster");
const { parsePersistedRoster } = await import("@/lib/people/schema");
const { STARTER_CIRCLES, STARTER_LOOKS, STARTER_PEOPLE, BLANK_LOOK } = await import("@/lib/people/starters");

const STORAGE_KEY = "affinity.people.v1";

const profile: TasteProfile = {
  version: 1,
  traits: {
    casual: { score: 0.85, confidence: 0.6, evidence: [{ comparisonId: "c1", selectedItemId: "a", rejectedItemId: "b", delta: 0.35, recordedAt: "2026-09-26T00:00:00Z" }] },
  },
  completedComparisonIds: ["c1"],
  updatedAt: "2026-09-26T00:00:00Z",
};

/** A blob exactly as the People Maker saved it before taste existed (no version, no tasteProfiles). */
const v1Blob = () => ({
  state: { people: STARTER_PEOPLE, looks: STARTER_LOOKS, circles: STARTER_CIRCLES },
});

async function rehydrate() {
  await useRoster.persist.rehydrate();
}

beforeEach(() => {
  memoryStorage.raw.clear();
  useRoster.getState().resetToStarters();
  memoryStorage.raw.clear();
});

describe("roster v1 → v2 migration", () => {
  it("loads a pre-taste blob without losing people, looks, or circles and starts taste empty", async () => {
    memoryStorage.setItem(STORAGE_KEY, JSON.stringify(v1Blob()));
    await rehydrate();
    const state = useRoster.getState();
    expect(state.people).toEqual(STARTER_PEOPLE);
    expect(state.looks).toEqual(STARTER_LOOKS);
    expect(state.circles).toEqual(STARTER_CIRCLES);
    expect(state.tasteProfiles).toEqual({});
  });

  it("writes the new version and taste map back while keeping the core shape", async () => {
    memoryStorage.setItem(STORAGE_KEY, JSON.stringify(v1Blob()));
    await rehydrate();
    useRoster.getState().setTasteProfile("daughter", profile);
    const saved = JSON.parse(memoryStorage.getItem(STORAGE_KEY)!) as { version: number; state: Record<string, unknown> };
    expect(saved.version).toBe(ROSTER_SCHEMA_VERSION);
    expect(saved.state.people).toEqual(STARTER_PEOPLE);
    expect(saved.state.tasteProfiles).toEqual({ daughter: profile });
  });

  it("keeps a saved taste profile across a reload", async () => {
    useRoster.getState().setTasteProfile("son", profile);
    useRoster.getState().resetToStarters();
    // resetToStarters overwrote storage; put a v2 blob back as an earlier session would have left it.
    memoryStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, state: { ...v1Blob().state, tasteProfiles: { son: profile } } }),
    );
    await rehydrate();
    expect(getTasteProfile("son")).toEqual(profile);
  });

  it("drops a corrupt taste entry on its own instead of failing the whole roster", () => {
    const parsed = parsePersistedRoster({
      ...v1Blob().state,
      tasteProfiles: {
        son: profile,
        daughter: { version: 1, traits: "nope" },
        wife: { ...profile, traits: { casual: { score: 7, confidence: 0.5, evidence: [] } } },
      },
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.people).toEqual(STARTER_PEOPLE);
    expect(Object.keys(parsed!.tasteProfiles)).toEqual(["son"]);
  });

  it("drops taste for people who no longer exist and unknown trait keys", () => {
    const parsed = parsePersistedRoster({
      ...v1Blob().state,
      tasteProfiles: {
        ghost: profile,
        son: { ...profile, traits: { ...profile.traits, sparkly: { score: 1, confidence: 1, evidence: [] } } },
      },
    });
    expect(Object.keys(parsed!.tasteProfiles)).toEqual(["son"]);
    expect(Object.keys(parsed!.tasteProfiles.son!.traits)).toEqual(["casual"]);
  });

  it("still rejects a broken core so the starter roster loads", () => {
    expect(parsePersistedRoster({ people: "nope", looks: {}, circles: {}, tasteProfiles: {} })).toBeNull();
  });
});

describe("taste lifecycle", () => {
  it("ignores taste for unknown ids and cascades removal", () => {
    const state = useRoster.getState();
    state.setTasteProfile("nobody", profile);
    expect(useRoster.getState().tasteProfiles).toEqual({});

    const id = state.addPerson({ name: "Rui", circle: "friend", relationship: "uncle", look: BLANK_LOOK })!;
    useRoster.getState().setTasteProfile(id, profile);
    expect(getTasteProfile(id)).toEqual(profile);
    useRoster.getState().removePerson(id);
    expect(getTasteProfile(id)).toBeUndefined();
    expect(useRoster.getState().looks[id]).toBeUndefined();
  });

  it("clears one person's taste without touching anyone else's", () => {
    useRoster.getState().setTasteProfile("son", profile);
    useRoster.getState().setTasteProfile("wife", profile);
    useRoster.getState().clearTasteProfile("son");
    expect(Object.keys(useRoster.getState().tasteProfiles)).toEqual(["wife"]);
  });
});
