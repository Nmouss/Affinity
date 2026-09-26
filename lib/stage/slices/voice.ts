import type { StateCreator } from "zustand";
import type { VoiceStatus } from "@/lib/voice/types";
import type { StageStore } from "../store";

// Owned by the director track. Unlock (status) and mute are session facts that must survive the
// stage reset (R) — only the live caption (interim) and an in-progress "listening" clear then.

export interface VoiceSlice {
  voiceStatus: VoiceStatus;
  voiceMuted: boolean;
  voiceInterim: string;
  setVoiceStatus: (status: VoiceStatus) => void;
  setVoiceMuted: (muted: boolean) => void;
  setVoiceInterim: (text: string) => void;
  /** Called by reset(): drops the live caption and stops "listening", but keeps unlock/mute facts. */
  resetVoiceSession: () => void;
}

export const createVoiceSlice: StateCreator<StageStore, [], [], VoiceSlice> = (set) => ({
  // The director corrects this to "unsupported" or "idle" the moment it knows the engines; "locked"
  // is the safe default in between (matches an unlocked-but-supported recognizer's starting point).
  voiceStatus: "locked",
  voiceMuted: false,
  voiceInterim: "",
  setVoiceStatus: (voiceStatus) => set({ voiceStatus }),
  setVoiceMuted: (voiceMuted) => set({ voiceMuted }),
  setVoiceInterim: (voiceInterim) => set({ voiceInterim }),
  resetVoiceSession: () =>
    set((state) => ({
      voiceInterim: "",
      voiceStatus: state.voiceStatus === "listening" ? "idle" : state.voiceStatus,
    })),
});
