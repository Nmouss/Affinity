import type { StateCreator } from "zustand";
import type { InputSource, TargetId } from "@/types/stage";
import type { StageStore } from "../store";

// Owned by the hands track. Written every tracking frame via setHand; scene code reads it with
// useStage.getState().hand inside useFrame instead of subscribing.

export interface HandPose {
  present: boolean;
  source: InputSource;
  /** Pointer in normalized device coordinates, -1..1 on both axes (y up). */
  pointer: [number, number];
  pinch: number;
  grab: number;
  rollDeg: number;
  hoverTarget: TargetId | null;
  draggingSpriteId: string | null;
  /** Where the pointer ray meets the floor (y = 0), in world units. */
  floorPoint: [number, number, number] | null;
  /** 0..1 while the handshake is held. */
  handshakeProgress: number;
  /** Fingertip positions for the ghost hand, in world units. */
  joints: Array<[number, number, number]> | null;
}

export interface HandSlice {
  hand: HandPose;
  setHand: (patch: Partial<HandPose>) => void;
  resetHand: () => void;
}

export function initialHand(): HandPose {
  return {
    present: false,
    source: "keyboard",
    pointer: [0, 0],
    pinch: 0,
    grab: 0,
    rollDeg: 0,
    hoverTarget: null,
    draggingSpriteId: null,
    floorPoint: null,
    handshakeProgress: 0,
    joints: null,
  };
}

export const createHandSlice: StateCreator<StageStore, [], [], HandSlice> = (set) => ({
  hand: initialHand(),
  setHand: (patch) => set((state) => ({ hand: { ...state.hand, ...patch } })),
  resetHand: () => set({ hand: initialHand() }),
});
