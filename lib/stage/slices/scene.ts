import type { StateCreator } from "zustand";
import { TREE } from "../layout";
import type { StageStore } from "../store";

// Owned by the room track. Beat timestamps are performance.now() values so useFrame code can
// compute progress without React state.

export type CameraMode = "fixed" | "orbit";

export interface OrbitState {
  /** Offset from the inspect view's base azimuth, in radians (positive swings toward the room). */
  azimuth: number;
  /** Offset from the inspect view's base elevation, in radians (positive looks down from higher up). */
  polar: number;
}

/** The T-rex → dinosaur ornaments beat, started by the veto and resolved by the next bundle. */
export interface ConflictBeat {
  startedAt: number;
  /** When the vetoed item starts shrinking into the ornament box; null until a bundle arrives. */
  resolveAt: number | null;
  /** Catalog item that was vetoed (inflatable-trex in the demo). */
  itemId: string;
  /** Ornament set it turns into (orn-dino in the demo). */
  resolvedItemId: string;
}

export interface SceneState {
  /** fixed: the home view with hand parallax. orbit: the inspect view around the tree. */
  cameraMode: CameraMode;
  orbit: OrbitState;
  /** performance.now() of the last hearth flare. */
  fireFlareAt: number | null;
  /** World point the inspect view looks at (the assembled tree's middle). */
  inspectTarget: [number, number, number];
  conflictBeat: ConflictBeat | null;
}

export interface SceneSlice {
  scene: SceneState;
  setScene: (patch: Partial<SceneState>) => void;
  /** Applies an orbit gesture delta with clamping. */
  nudgeOrbit: (dx: number, dy: number) => void;
  flareFire: () => void;
  resetScene: () => void;
}

/** Azimuth swing either side of the base view, and the elevation band, both in radians. */
export const ORBIT_LIMITS = {
  azimuth: (70 * Math.PI) / 180,
  polarMin: (-8 * Math.PI) / 180,
  polarMax: (30 * Math.PI) / 180,
} as const;

/**
 * Radians per unit of gesture delta. The hands track sends pointer deltas in NDC (-1..1), so a
 * full-width palm sweep (dx = 2) turns about 90 degrees.
 */
export const ORBIT_GAIN = { azimuth: 0.8, polar: 0.45 } as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampOrbit(orbit: OrbitState): OrbitState {
  return {
    azimuth: clamp(orbit.azimuth, -ORBIT_LIMITS.azimuth, ORBIT_LIMITS.azimuth),
    polar: clamp(orbit.polar, ORBIT_LIMITS.polarMin, ORBIT_LIMITS.polarMax),
  };
}

export function applyOrbitDelta(orbit: OrbitState, dx: number, dy: number): OrbitState {
  return clampOrbit({
    azimuth: orbit.azimuth + dx * ORBIT_GAIN.azimuth,
    polar: orbit.polar + dy * ORBIT_GAIN.polar,
  });
}

export function initialScene(): SceneState {
  return {
    cameraMode: "fixed",
    orbit: { azimuth: 0, polar: 0 },
    fireFlareAt: null,
    inspectTarget: [TREE.position[0], 2, TREE.position[2]],
    conflictBeat: null,
  };
}

export const createSceneSlice: StateCreator<StageStore, [], [], SceneSlice> = (set) => ({
  scene: initialScene(),
  setScene: (patch) => set((state) => ({ scene: { ...state.scene, ...patch } })),
  nudgeOrbit: (dx, dy) =>
    set((state) => ({ scene: { ...state.scene, orbit: applyOrbitDelta(state.scene.orbit, dx, dy) } })),
  flareFire: () => set((state) => ({ scene: { ...state.scene, fireFlareAt: performance.now() } })),
  resetScene: () => set({ scene: initialScene() }),
});
