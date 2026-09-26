import { create } from "zustand";
import { createCouncilSlice, type CouncilSlice } from "./slices/council";
import { createHandSlice, type HandSlice } from "./slices/hand";
import { createSceneSlice, type SceneSlice } from "./slices/scene";
import { createVoiceSlice, type VoiceSlice } from "./slices/voice";

// Each slice file is owned by one track (council: director, hand: hands, scene: room, voice: director).
// Per-frame values (hand pose) are written with setState and read with getState() inside
// useFrame, so they never re-render React.
export type StageStore = CouncilSlice & HandSlice & SceneSlice & VoiceSlice;

export const useStage = create<StageStore>()((...args) => ({
  ...createCouncilSlice(...args),
  ...createHandSlice(...args),
  ...createSceneSlice(...args),
  ...createVoiceSlice(...args),
}));
