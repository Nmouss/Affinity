import { useMemo } from "react";
import { create } from "zustand";
import type { CharacterLook, Circle } from "@/types/character";
import type { FamilyProfile } from "@/types/domain";
import { STARTER_CIRCLES, STARTER_LOOKS, STARTER_PEOPLE } from "./starters";

// Everyone the app knows: family and friends, made in the People Maker (/create). Profiles keep the
// agents' FamilyProfile shape; looks and circles sit beside them keyed by id. React reads with the
// hooks below, everything else (director, attribution, keyboard) with getPeople()/getPerson().
// Persistence (localStorage, validated) is added by the roster track.

export const MAX_PEOPLE = 24;

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
  /** Adds a person and returns their id, or null when the roster is full. */
  addPerson: (person: NewPerson) => string | null;
  updatePerson: (id: string, patch: PersonPatch) => void;
  removePerson: (id: string) => void;
  setCircle: (id: string, circle: Circle) => void;
  /** Reorders to match `ids`; ids not listed keep their relative order at the end. */
  reorder: (ids: string[]) => void;
  resetToStarters: () => void;
}

function newId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function starterState(): Pick<RosterState, "people" | "looks" | "circles"> {
  return {
    people: STARTER_PEOPLE.map((profile) => ({ ...profile })),
    looks: structuredClone(STARTER_LOOKS),
    circles: { ...STARTER_CIRCLES },
  };
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

export const useRoster = create<RosterState>()((set, get) => ({
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
    })),
  setCircle: (id, circle) => set((state) => ({ circles: { ...state.circles, [id]: circle } })),
  reorder: (ids) =>
    set((state) => {
      const rank = new Map(ids.map((id, index) => [id, index]));
      const listed = state.people.filter((profile) => rank.has(profile.id));
      listed.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
      return { people: [...listed, ...state.people.filter((profile) => !rank.has(profile.id))] };
    }),
  resetToStarters: () => set(starterState()),
}));

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
