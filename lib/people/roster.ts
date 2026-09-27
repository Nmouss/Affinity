import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import type { TasteProfile } from "@/lib/taste/types";
import type { CharacterLook, Circle } from "@/types/character";
import type { FamilyProfile } from "@/types/domain";
import { DOORWAY, homeSpot, type Vec3 } from "@/lib/stage/layout";
import { parsePersistedRoster, type PersistedRoster } from "./schema";
import { STARTER_CIRCLES, STARTER_LOOKS, STARTER_PEOPLE } from "./starters";

// Everyone the app knows: family and friends, made in the People Maker (/create). Profiles keep the
// agents' FamilyProfile shape; looks and circles sit beside them keyed by id. React reads with the
// hooks below, everything else (director, attribution, keyboard) with getPeople()/getPerson().
// Persisted to localStorage (validated on load; corrupt or invalid data falls back to starters).
// Learned taste lives in a sibling `tasteProfiles` map keyed by person id (schema v2): old v1 blobs
// load with an empty map, and removing a person removes their taste.

export const MAX_PEOPLE = 24;

const STORAGE_KEY = "affinity.people.v1";
/** Bumped when the persisted shape grows; parsePersistedRoster accepts every older shape. */
export const ROSTER_SCHEMA_VERSION = 2;
type Persisted = Pick<RosterState, "people" | "looks" | "circles" | "tasteProfiles">;

export interface NewPerson {
  name: string;
  circle: Circle;
  relationship: string;
  look: CharacterLook;
}

export interface PersonPatch {
  name?: string;
  relationship?: string;
  look?: CharacterLook;
}

export interface RosterState {
  /** In display order: the lobby chips and number keys follow it (family first). */
  people: FamilyProfile[];
  looks: Record<string, CharacterLook>;
  circles: Record<string, Circle>;
  /** What each character has learned about its person's taste, keyed by person id. */
  tasteProfiles: Record<string, TasteProfile>;
  /** Adds a person and returns their id, or null when the roster is full. */
  addPerson: (person: NewPerson) => string | null;
  updatePerson: (id: string, patch: PersonPatch) => void;
  /** Removes the person and, with them, their look, circle, and taste. */
  removePerson: (id: string) => void;
  setCircle: (id: string, circle: Circle) => void;
  /** Stores a taste profile for a person the roster knows; ignored for unknown ids. */
  setTasteProfile: (id: string, profile: TasteProfile) => void;
  clearTasteProfile: (id: string) => void;
  /** Reorders to match `ids`; ids not listed keep their relative order at the end. */
  reorder: (ids: string[]) => void;
  resetToStarters: () => void;
}

function newId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function starterState(): Persisted {
  return {
    people: STARTER_PEOPLE.map((profile) => ({ ...profile })),
    looks: structuredClone(STARTER_LOOKS),
    circles: { ...STARTER_CIRCLES },
    tasteProfiles: {},
  };
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * localStorage, guarded for SSR (no such global there — checked directly rather than via `window`
 * so a test can stub just `globalThis.localStorage`) and validated on the way in: a hand-edited or
 * out-of-date blob fails parsePersistedRoster and getItem returns null, which persist treats as
 * "nothing saved" and keeps the starter roster already in the store.
 */
const rosterStorage: PersistStorage<Persisted> = {
  getItem: (name) => {
    if (typeof localStorage === "undefined") return null;
    let raw: string | null;
    try {
      raw = localStorage.getItem(name);
    } catch {
      return null;
    }
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (typeof parsed !== "object" || parsed === null || !("state" in parsed)) return null;
    const state = parsePersistedRoster((parsed as { state: unknown }).state);
    if (!state) return null;
    const { version } = parsed as { version?: number };
    return { state, version } satisfies StorageValue<PersistedRoster>;
  },
  setItem: (name, value) => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch {
      // Storage full or blocked (private browsing); the roster still works for this session.
    }
  },
  removeItem: (name) => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

export const useRoster = create<RosterState>()(
  persist(
    (set, get) => ({
      ...starterState(),
      addPerson: ({ name, circle, relationship, look }) => {
        if (get().people.length >= MAX_PEOPLE) return null;
        const id = newId();
        const profile: FamilyProfile = {
          id,
          name,
          relationship,
          look: "custom",
          colors: [look.bodyColor, look.accent],
          personality: [],
          loves: [],
          avoids: [],
          houseRules: [],
        };
        set((state) => ({
          people: [...state.people, profile],
          looks: { ...state.looks, [id]: look },
          circles: { ...state.circles, [id]: circle },
        }));
        return id;
      },
      updatePerson: (id, { name, relationship, look }) =>
        set((state) => ({
          people: state.people.map((profile) =>
            profile.id !== id
              ? profile
              : {
                  ...profile,
                  ...(name !== undefined && { name }),
                  ...(relationship !== undefined && { relationship }),
                  ...(look && { colors: [look.bodyColor, look.accent] }),
                },
          ),
          looks: look ? { ...state.looks, [id]: look } : state.looks,
        })),
      removePerson: (id) =>
        set((state) => ({
          people: state.people.filter((profile) => profile.id !== id),
          looks: withoutKey(state.looks, id),
          circles: withoutKey(state.circles, id),
          tasteProfiles: withoutKey(state.tasteProfiles, id),
        })),
      setCircle: (id, circle) => set((state) => ({ circles: { ...state.circles, [id]: circle } })),
      setTasteProfile: (id, profile) =>
        set((state) =>
          state.people.some((person) => person.id === id) ? { tasteProfiles: { ...state.tasteProfiles, [id]: profile } } : {},
        ),
      clearTasteProfile: (id) => set((state) => ({ tasteProfiles: withoutKey(state.tasteProfiles, id) })),
      reorder: (ids) =>
        set((state) => {
          const rank = new Map(ids.map((id, index) => [id, index]));
          const listed = state.people.filter((profile) => rank.has(profile.id));
          listed.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
          return { people: [...listed, ...state.people.filter((profile) => !rank.has(profile.id))] };
        }),
      resetToStarters: () => set(starterState()),
    }),
    {
      name: STORAGE_KEY,
      version: ROSTER_SCHEMA_VERSION,
      storage: rosterStorage,
      skipHydration: true,
      partialize: (state) => ({ people: state.people, looks: state.looks, circles: state.circles, tasteProfiles: state.tasteProfiles }),
      // getItem already normalizes every older blob through parsePersistedRoster (v1 → empty taste),
      // so migrating is just accepting that normalized state whatever version it was saved under.
      migrate: (persisted) => persisted as Persisted,
    },
  ),
);

export function getPeople(): FamilyProfile[] {
  return useRoster.getState().people;
}

export function getPerson(id: string): FamilyProfile | undefined {
  return useRoster.getState().people.find((profile) => profile.id === id);
}

export function getLook(id: string): CharacterLook | undefined {
  return useRoster.getState().looks[id];
}

export function getCircle(id: string): Circle | undefined {
  return useRoster.getState().circles[id];
}

export function getTasteProfile(id: string): TasteProfile | undefined {
  return useRoster.getState().tasteProfiles[id];
}

export function useTasteProfile(id: string): TasteProfile | undefined {
  return useRoster((state) => state.tasteProfiles[id]);
}

export function usePeople(): FamilyProfile[] {
  return useRoster((state) => state.people);
}

export function useLook(id: string): CharacterLook | undefined {
  return useRoster((state) => state.looks[id]);
}

/** People in one circle, in roster order. Memoized so zustand never sees a fresh array per render. */
export function useCircle(circle: Circle): FamilyProfile[] {
  const people = usePeople();
  const circles = useRoster((state) => state.circles);
  return useMemo(() => people.filter((profile) => circles[profile.id] === circle), [people, circles, circle]);
}

/**
 * Family first, then friends, both in roster order: what the number keys, Tab hover cycling, and
 * the two invite-chip rows all follow.
 */
export function orderedRoster(): FamilyProfile[] {
  const people = getPeople();
  const family = people.filter((profile) => getCircle(profile.id) === "family");
  const friends = people.filter((profile) => getCircle(profile.id) !== "family");
  return [...family, ...friends];
}

/**
 * Where a person waits when not seated. Family stand at their home spot, in family order; friends
 * default to the doorway (SpriteToken/restSpot in lib/stage/slices/council.ts picks a guest spot
 * instead while they're visiting). A roster-aware replacement for the old fixed homePosition(id).
 */
export function lobbySpot(id: string): Vec3 {
  if (getCircle(id) === "friend") return DOORWAY;
  const familyIds = getPeople()
    .filter((profile) => getCircle(profile.id) === "family")
    .map((profile) => profile.id);
  const index = familyIds.indexOf(id);
  return homeSpot(index < 0 ? 0 : index);
}

/** True once anything has ever been saved for this browser. Hud shows its "make your family and
 *  friends" hint only while this is false (a brand-new visitor with nothing persisted yet). */
export function hasSavedRoster(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return true;
  }
}

// Only the first call actually rehydrates; later calls (e.g. the maker UI mounting after the Hud
// already has) are no-ops.
let hydrationStarted = false;

/**
 * Loads any saved roster from localStorage. Call once on the client — Hud does this on every stage
 * page, and the People Maker (/create) can call it too since it may be the first page visited.
 * skipHydration keeps the store on the starter roster (identical on server and client) until this
 * runs, so there is never a hydration mismatch and the server never touches localStorage.
 */
export function useRosterHydration(): void {
  useEffect(() => {
    if (hydrationStarted) return;
    hydrationStarted = true;
    void useRoster.persist.rehydrate();
  }, []);
}
