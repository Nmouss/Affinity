import { beforeEach, describe, expect, it } from "vitest";

// vitest runs in a plain node environment (no DOM), so there is no global `localStorage`. The
// roster store checks for one at call time (typeof localStorage === "undefined"), so a simple
// in-memory stand-in on globalThis is all it takes to exercise real persistence.
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

const { useRoster, getPeople, getLook, getCircle, orderedRoster, lobbySpot } = await import("@/lib/people/roster");
const { BLANK_LOOK, STARTER_PEOPLE } = await import("@/lib/people/starters");
const { DOORWAY, homeSpot } = await import("@/lib/stage/layout");

const STORAGE_KEY = "affinity.people.v2";

describe("roster persistence", () => {
  beforeEach(() => {
    memoryStorage.raw.clear();
    useRoster.getState().resetToStarters();
    // resetToStarters just wrote the (unremarkable) starter snapshot back to storage; clear it so
    // each test starts from a clean, empty localStorage.
    memoryStorage.raw.clear();
  });

  it("serializes an added person to localStorage and rehydrates them back", async () => {
    const id = useRoster.getState().addPerson({
      name: "Uncle Rui",
      circle: "friend",
      relationship: "uncle",
      look: BLANK_LOOK,
    });
    expect(id).not.toBeNull();
    expect(getPeople().some((profile) => profile.id === id)).toBe(true);

    // The write-through happened synchronously off the addPerson() call above.
    const savedRaw = memoryStorage.raw.get(STORAGE_KEY);
    expect(savedRaw).toBeTruthy();
    const saved = JSON.parse(savedRaw!);
    expect(saved.state.people.some((profile: { id: string }) => profile.id === id)).toBe(true);

    // Simulate a fresh page load: back to starters in memory, but restore the captured snapshot in
    // storage (resetToStarters above would otherwise have overwritten it), then rehydrate.
    useRoster.getState().resetToStarters();
    memoryStorage.raw.set(STORAGE_KEY, savedRaw!);
    await useRoster.persist.rehydrate();

    expect(getPeople().some((profile) => profile.id === id)).toBe(true);
    expect(getCircle(id!)).toBe("friend");
    expect(getLook(id!)).toEqual(BLANK_LOOK);
  });

  it("falls back to the starter roster when the saved data is corrupt", async () => {
    memoryStorage.raw.set(STORAGE_KEY, "{not even valid json");
    await useRoster.persist.rehydrate();
    expect(getPeople().map((profile) => profile.id)).toEqual(STARTER_PEOPLE.map((profile) => profile.id));
  });

  it("falls back to the starter roster when the saved data fails schema validation", async () => {
    memoryStorage.raw.set(
      STORAGE_KEY,
      JSON.stringify({ state: { people: "not an array", looks: {}, circles: {} }, version: 0 }),
    );
    await useRoster.persist.rehydrate();
    expect(getPeople().map((profile) => profile.id)).toEqual(STARTER_PEOPLE.map((profile) => profile.id));
  });

  it("also rejects a look with an unknown enum value", async () => {
    const good = useRoster.getState().addPerson({
      name: "Cousin Lee",
      circle: "family",
      relationship: "cousin",
      look: BLANK_LOOK,
    });
    const raw = memoryStorage.raw.get(STORAGE_KEY)!;
    const parsed = JSON.parse(raw);
    parsed.state.looks[good!].eyes.type = "laser-beam"; // not one of EYE_TYPES
    memoryStorage.raw.set(STORAGE_KEY, JSON.stringify(parsed));

    useRoster.getState().resetToStarters();
    await useRoster.persist.rehydrate();
    expect(getPeople().map((profile) => profile.id)).toEqual(STARTER_PEOPLE.map((profile) => profile.id));
  });
});

describe("orderedRoster", () => {
  beforeEach(() => {
    useRoster.getState().resetToStarters();
  });

  it("keeps starters in their original order when they share one circle", () => {
    expect(orderedRoster().map((profile) => profile.id)).toEqual(STARTER_PEOPLE.map((profile) => profile.id));
  });

  it("puts every family member before every friend, regardless of insertion order", () => {
    const friendId = useRoster.getState().addPerson({ name: "Friend A", circle: "friend", relationship: "friend", look: BLANK_LOOK });
    const familyId = useRoster.getState().addPerson({ name: "New Kid", circle: "family", relationship: "kid", look: BLANK_LOOK });
    const order = orderedRoster().map((profile) => profile.id);
    expect(order.indexOf(familyId!)).toBeLessThan(order.indexOf(friendId!));
    // All three starters (family) still come before the friend too.
    for (const starter of STARTER_PEOPLE) expect(order.indexOf(starter.id)).toBeLessThan(order.indexOf(friendId!));
  });
});

describe("lobbySpot", () => {
  beforeEach(() => {
    useRoster.getState().resetToStarters();
  });

  it("sends starter friends to the doorway", () => {
    STARTER_PEOPLE.forEach((profile) => expect(lobbySpot(profile.id)).toEqual(DOORWAY));
  });

  it("sends newly added family to their home spot", () => {
    const id = useRoster.getState().addPerson({ name: "Auntie", circle: "family", relationship: "aunt", look: BLANK_LOOK });
    expect(lobbySpot(id!)).toEqual(homeSpot(0));
  });

  it("defaults friends to the doorway", () => {
    const id = useRoster.getState().addPerson({ name: "Friend B", circle: "friend", relationship: "friend", look: BLANK_LOOK });
    expect(lobbySpot(id!)).toEqual(DOORWAY);
  });
});
