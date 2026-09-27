import { create } from "zustand";

// Shared state between the Plaza's 3D scene (hover, drag, formation) and its DOM rails (icons,
// whistle, cursor). MakerHands and the mouse both write the pointer; the scene decides what's under it.

export type WhistleSort = "name" | "circle";

/** Icons a person can be dropped on (or that act on the selected person). */
export type PlazaDrop = "edit" | "remove" | "move";

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
  /** Set by the scene when a person is dropped on (or an icon is used with) a rail icon; the flow consumes it. */
  dropAction: { action: PlazaDrop; personId: string; at: number } | null;
  setPointer: (pointer: [number, number] | null, source: "mouse" | "hand" | null) => void;
  setGrabbing: (grabbing: boolean) => void;
  setHovered: (id: string | null) => void;
  select: (id: string | null) => void;
  setDragging: (id: string | null) => void;
  setWhistle: (whistle: Partial<PlazaState["whistle"]>) => void;
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
  dropAction: null,
  setPointer: (pointer, pointerSource) => set({ pointer, pointerSource }),
  setGrabbing: (grabbing) => set({ grabbing }),
  setHovered: (hoveredId) => set({ hoveredId }),
  select: (selectedId) => set({ selectedId }),
  setDragging: (draggingId) => set({ draggingId }),
  setWhistle: (whistle) => set((state) => ({ whistle: { ...state.whistle, ...whistle } })),
  requestDrop: (action, personId) => set({ dropAction: { action, personId, at: Date.now() } }),
  clearDrop: () => set({ dropAction: null }),
}));

// Read-only handle for browser checks (the headless walkthrough watches drags and drops through it).
if (typeof window !== "undefined") (window as unknown as { __affinityPlaza?: typeof usePlaza }).__affinityPlaza = usePlaza;
