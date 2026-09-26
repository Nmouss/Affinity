import type { StateCreator } from "zustand";
import type { StageStore } from "../store";

// Owned by the room track.

export interface SceneState {
  cameraMode: "fixed" | "orbit";
  /** Orbit offsets around the tree, in radians. */
  orbit: { azimuth: number; polar: number };
}

export interface SceneSlice {
  scene: SceneState;
  setScene: (patch: Partial<SceneState>) => void;
  resetScene: () => void;
}

export function initialScene(): SceneState {
  return { cameraMode: "fixed", orbit: { azimuth: 0, polar: 0 } };
}

export const createSceneSlice: StateCreator<StageStore, [], [], SceneSlice> = (set) => ({
  scene: initialScene(),
  setScene: (patch) => set((state) => ({ scene: { ...state.scene, ...patch } })),
  resetScene: () => set({ scene: initialScene() }),
});
