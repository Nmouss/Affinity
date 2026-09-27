import { create } from "zustand";

// Shared state between the Plaza's 3D scene (hover, drag, formation) and its DOM rails (icons,
// whistle, cursor). MakerHands and the mouse both write the pointer; the scene decides what's under it.

export type WhistleSort = "name" | "circle";

/** Icons a person can be dropped on (or that act on the selected person). */
export type PlazaDrop = "edit" | "remove" | "move";

/** The persistent group-building area drawn in the middle of the world. */
export const MISSION_CIRCLE = { x: 0, z: 0, radius: 3.15 } as const;

export function isInsideMissionCircle(x: number, z: number): boolean {
  return Math.hypot(x - MISSION_CIRCLE.x, z - MISSION_CIRCLE.z) <= MISSION_CIRCLE.radius;
}

/** Push a roaming person's center to the nearest legal point outside the mission circle. */
export function constrainOutsideMissionCircle(x: number, z: number, clearance = 0): [number, number] {
  const dx = x - MISSION_CIRCLE.x;
  const dz = z - MISSION_CIRCLE.z;
  const distance = Math.hypot(dx, dz);
  const minimum = MISSION_CIRCLE.radius + Math.max(0, clearance);
  if (distance >= minimum) return [x, z];
  if (distance < 1e-6) return [MISSION_CIRCLE.x + minimum, MISSION_CIRCLE.z];
  const scale = minimum / distance;
  return [MISSION_CIRCLE.x + dx * scale, MISSION_CIRCLE.z + dz * scale];
}

/** Attribute on the rail buttons that accept a dragged person, e.g. data-plaza-drop="remove". */
export const PLAZA_DROP_ATTR = "data-plaza-drop";

export interface PlazaState {
  /** Pointer in NDC over the plaza canvas, or null when it's off the canvas / no hand. */
  pointer: [number, number] | null;
  pointerSource: "mouse" | "hand" | null;
  /** Mouse button held or pinch held: grabs whoever is hovered. */
  grabbing: boolean;
  hoveredId: string | null;
  selectedId: string | null;
  draggingId: string | null;
  whistle: { on: boolean; sort: WhistleSort };
  /** People physically dropped into the mission circle, in stable drop order. */
  missionMemberIds: string[];
  /** Set by the scene when a person is dropped on (or an icon is used with) a rail icon; the flow consumes it. */
  dropAction: { action: PlazaDrop; personId: string; at: number } | null;
  setPointer: (pointer: [number, number] | null, source: "mouse" | "hand" | null) => void;
  setGrabbing: (grabbing: boolean) => void;
  setHovered: (id: string | null) => void;
  select: (id: string | null) => void;
  setDragging: (id: string | null) => void;
  setWhistle: (whistle: Partial<PlazaState["whistle"]>) => void;
  setMissionMember: (personId: string, inside: boolean) => void;
  requestDrop: (action: PlazaDrop, personId: string) => void;
  clearDrop: () => void;
}

export const usePlaza = create<PlazaState>()((set) => ({
  pointer: null,
  pointerSource: null,
  grabbing: false,
  hoveredId: null,
  selectedId: null,
  draggingId: null,
  whistle: { on: false, sort: "name" },
  missionMemberIds: [],
  dropAction: null,
  setPointer: (pointer, pointerSource) => set({ pointer, pointerSource }),
  setGrabbing: (grabbing) => set({ grabbing }),
  setHovered: (hoveredId) => set({ hoveredId }),
  select: (selectedId) => set({ selectedId }),
  setDragging: (draggingId) => set({ draggingId }),
  setWhistle: (whistle) => set((state) => ({ whistle: { ...state.whistle, ...whistle } })),
  setMissionMember: (personId, inside) =>
    set((state) => ({
      missionMemberIds: inside
        ? state.missionMemberIds.includes(personId)
          ? state.missionMemberIds
          : [...state.missionMemberIds, personId]
        : state.missionMemberIds.filter((id) => id !== personId),
    })),
  requestDrop: (action, personId) => set({ dropAction: { action, personId, at: Date.now() } }),
  clearDrop: () => set({ dropAction: null }),
}));

// Read-only handle for browser checks (the headless walkthrough watches drags and drops through it).
if (typeof window !== "undefined") (window as unknown as { __affinityPlaza?: typeof usePlaza }).__affinityPlaza = usePlaza;
