import type { StoreApi } from "zustand";
import { signMandate } from "@/lib/crypto/sign";
import { emitGesture, onGesture, setArmingPolicy } from "@/lib/stage/bus";
import { COUNCIL_RING } from "@/lib/stage/layout";
import type { StageStore } from "@/lib/stage/store";
import { createVoiceStubs, type Recognizer, type Speaker, type VoiceStatus } from "@/lib/voice/types";
import type { Bundle, CartMandate, Mission } from "@/types/domain";
import type { GestureEvent } from "@/types/stage";
import { isGestureArmed, type ArmingContext } from "./arming";
import { BeatQueue, CUT90_BEATS, DEFAULT_BEATS, type Beat, type BeatDurations } from "./beats";
import { runCouncil, type CouncilRunOptions } from "./councilClient";
import { buildMission } from "./mission";

// The director sits between the hands and the agents: it decides what each armed gesture means in the
// current phase, runs the council, and paces its events into beats so stage timing never depends on
// LLM speed.

export interface DirectorOptions {
  store: StoreApi<StageStore>;
  /** Play the local stage transcript instead of calling /api/council (`?demo`). */
  preferReplay?: boolean;
  /** The 90-second cut preset (`?cut=90`). */
  cut90?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
  stallMs?: number;
  sign?: (mission: Mission, bundle: Bundle) => Promise<CartMandate>;
  log?: (message: string, detail?: unknown) => void;
  /** Same injection pattern as fetchImpl/sign. Defaults to no-op stubs until Track B's engines land. */
  voice?: { recognizer: Recognizer; speaker: Speaker };
}

export interface Director {
  /** Overrides individual beat durations (leva tuning in /lab). */
  tuneBeats: (patch: Partial<BeatDurations>) => void;
  readonly beats: BeatDurations;
  /** Unlocks speechSynthesis from a user activation (click/key press). Safe to call more than once. */
  unlockVoice: () => void;
  dispose: () => void;
}

const SEAT_COUNT = COUNCIL_RING.seatAngles.length;

export function seatedInOrder(state: Pick<StageStore, "sprites">): string[] {
  return Object.entries(state.sprites)
    .filter(([, sprite]) => sprite.seat !== null)
    .sort(([, a], [, b]) => (a.seat ?? 0) - (b.seat ?? 0))
    .map(([id]) => id);
}

export function armingContext(state: StageStore, now: number): ArmingContext {
  return {
    phase: state.phase,
    missionText: state.missionText,
    seatedCount: seatedInOrder(state).length,
    bundleShownAt: state.bundleShownAt,
    now,
  };
}

export function createDirector(options: DirectorOptions): Director {
  const { store } = options;
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const sign = options.sign ?? signMandate;
  const log = options.log ?? ((message: string, detail?: unknown) => console.info(`[director] ${message}`, detail ?? ""));
  const beats: BeatDurations = { ...(options.cut90 ? CUT90_BEATS : DEFAULT_BEATS) };
  const get = () => store.getState();
  const { recognizer, speaker } = options.voice ?? createVoiceStubs();

  // Bumped on every reset so async work from an older run can tell it has been superseded.
  let run = 0;
  let council: AbortController | null = null;

  const initialVoiceStatus: VoiceStatus = !recognizer.supported ? "unsupported" : speaker.unlocked ? "idle" : "locked";
  get().setVoiceStatus(initialVoiceStatus);

  const applyBeat = (beat: Beat) => {
    if (beat.kind === "streamEnd") {
      if (get().phase !== "awaitMandate") get().advancePhase("streamEnd");
      return;
    }
    get().applyCouncilEvent(beat.event);
  };

  /** Speaks opinions and scores in the sprite's own voice; everything else (or muted/locked) is silent. */
  const voiceForBeat = (beat: Beat): Promise<void> | null => {
    if (beat.kind !== "event") return null;
    if (beat.event.type !== "opinion" && beat.event.type !== "score") return null;
    if (options.cut90 || get().voiceMuted || !speaker.supported || !speaker.unlocked) return null;
    const { spriteId, say } = beat.event.payload;
    if (!say?.trim()) return null;
    return speaker.speak(spriteId, say);
  };

  const queue = new BeatQueue({
    apply: applyBeat,
    durations: () => beats,
    voice: voiceForBeat,
    onBeatEnd: (beat) => {
      if (beat.kind === "event" && beat.event.type === "opinion") {
        const id = beat.event.payload.spriteId;
        if (get().sprites[id]?.mood === "speaking") get().setSpriteMood(id, "listening");
      }
    },
  });

  async function convene() {
    const state = get();
    const invited = seatedInOrder(state);
    const mission = buildMission(state.missionText, invited);
    const runId = ++run;
    council?.abort();
    council = new AbortController();
    state.setMission(mission);
    state.setError(null);
    state.openProfile(null);
    state.advancePhase("convene");
    for (const id of invited) state.setSpriteMood(id, "thinking");

    const runOptions: CouncilRunOptions = {
      signal: council.signal,
      preferReplay: options.preferReplay,
      stallMs: options.stallMs,
      replaySpeed: options.cut90 ? 2 : 1,
      fetchImpl,
      onSource: (source) => runId === run && get().setCouncilSource(source),
      onFallback: (reason) => log(`falling back to replay: ${reason}`),
    };
    try {
      for await (const event of runCouncil(mission, runOptions)) {
        if (runId !== run) return;
        queue.push({ kind: "event", event });
      }
      if (runId === run) queue.push({ kind: "streamEnd" });
    } catch (error) {
      if (runId !== run || council?.signal.aborted) return;
      get().setError(error instanceof Error ? error.message : "The council could not be reached");
    }
  }

  async function approve() {
    const state = get();
    const bundle = state.bundle;
    if (!bundle) return;
    const mission =
      state.mission ?? buildMission(state.missionText, [...new Set([...seatedInOrder(state), ...Object.keys(state.opinions)])]);
    const runId = run;
    state.setError(null);
    state.advancePhase("handshakeComplete");
    try {
      const mandate = await sign(mission, bundle);
      const response = await fetchImpl("/api/mandate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mandate),
      });
      const result = (await response.json().catch(() => ({}))) as { valid?: boolean; receiptId?: string };
      if (runId !== run) return;
      if (result.valid && result.receiptId) {
        get().completeMandate(result.receiptId, mandate);
      } else {
        get().advancePhase("mandateRejected");
        get().setError("The mandate signature was rejected. Shake again to retry.");
      }
    } catch (error) {
      if (runId !== run) return;
      get().advancePhase("mandateRejected");
      get().setError(error instanceof Error ? `Signing failed: ${error.message}` : "Signing failed");
    }
  }

  function reset() {
    run += 1;
    council?.abort();
    council = null;
    queue.clear();
    recognizer.abort();
    speaker.cancel();
    const state = get();
    state.resetCouncil();
    state.resetHand();
    state.resetScene();
    state.resetVoiceSession();
  }

  function unlockVoice() {
    speaker.unlock();
    if (get().voiceStatus === "locked") get().setVoiceStatus("idle");
  }

  function nextFreeSeat(): number | null {
    const taken = new Set(Object.values(get().sprites).map((sprite) => sprite.seat));
    for (let seat = 0; seat < SEAT_COUNT; seat += 1) if (!taken.has(seat)) return seat;
    return null;
  }

  function handle(event: GestureEvent) {
    const state = get();
    switch (event.type) {
      case "seat": {
        if (state.sprites[event.spriteId]?.seat != null) return;
        const seat = nextFreeSeat();
        if (seat !== null) state.seatSprite(event.spriteId, seat);
        return;
      }
      case "dragStart":
        state.setSpriteMood(event.spriteId, "held");
        return;
      case "dragEnd": {
        if (event.seat !== null) {
          // Dropping onto an occupied seat sends its occupant home.
          const occupant = Object.entries(state.sprites).find(
            ([id, sprite]) => id !== event.spriteId && sprite.seat === event.seat,
          );
          if (occupant) state.seatSprite(occupant[0], null);
        }
        state.seatSprite(event.spriteId, event.seat);
        return;
      }
      case "pinchTap": {
        const target = event.target;
        if (target === "hearth") {
          if (!emitGesture({ type: "convene" }) && state.phase === "lobby") {
            state.setError("Seat at least one sprite in the council ring first.");
          }
          return;
        }
        if (target.startsWith("sprite:")) {
          const id = target.slice("sprite:".length);
          if (state.phase === "lobby") {
            state.openProfile(state.profileOpenId === id ? null : id);
          } else if (state.reasoningFocusId === id) {
            state.setReasoningFocus(null);
          } else {
            state.setReasoningFocus(id);
            if (!state.reasoningVisible) state.toggleReasoning();
          }
          return;
        }
        if (state.profileOpenId) state.openProfile(null);
        return;
      }
      case "convene":
        void convene();
        return;
      case "handshakeComplete":
        void approve();
        return;
      case "toggleReasoning":
        state.toggleReasoning();
        return;
      case "reset":
        reset();
        return;
      case "swipe":
        // No agent endpoint for swapping items yet; this is where a revise request would go.
        log("swipe (no-op)", event.itemId);
        return;
      case "talkStart": {
        if (state.voiceStatus === "unsupported" || state.voiceStatus === "listening") return;
        state.openProfile(null);
        state.setError(null);
        state.setVoiceStatus("listening");
        const talkRun = run; // a reset() between now and onFinal bumps `run`, dropping the result
        recognizer.start({
          onInterim: (text) => {
            state.setMissionText(text);
            state.setVoiceInterim(text);
          },
          onFinal: (text) => {
            if (talkRun !== run) return;
            const heard = text.trim();
            if (!heard) {
              get().setError("I didn't catch that — hold your palm up and try again.");
              return;
            }
            get().setMissionText(heard);
            if (!emitGesture({ type: "convene" })) {
              get().setError("Seat at least one sprite in the council ring first.");
            }
          },
          onError: (code) => {
            if (code === "no-speech" || code === "aborted") return;
            if (code === "not-allowed" || code === "service-not-allowed") {
              get().setError("Voice needs microphone access — allow it for this page and try again.");
            } else if (code === "network") {
              get().setError("Voice needs a steady connection — try typing on this Wi-Fi instead.");
            } else if (code === "language-not-supported") {
              get().setError("This browser can't recognize that language here — try typing instead.");
            }
          },
        });
        return;
      }
      case "talkEnd": {
        if (state.voiceStatus !== "listening") return;
        recognizer.stop();
        state.setVoiceInterim("");
        state.setVoiceStatus(speaker.unlocked ? "idle" : "locked");
        return;
      }
      case "toggleVoiceMute": {
        const muted = !state.voiceMuted;
        state.setVoiceMuted(muted);
        if (muted) speaker.cancel();
        return;
      }
      case "hover":
      case "orbit":
      case "handshakeProgress":
        // Rendered by the hands and room tracks straight from the hand slice.
        return;
    }
  }

  const restorePolicy = setArmingPolicy((type) => isGestureArmed(type, armingContext(get(), now())));
  const unsubscribe = onGesture(handle);

  return {
    beats,
    tuneBeats: (patch) => {
      Object.assign(beats, patch);
    },
    unlockVoice,
    dispose: () => {
      unsubscribe();
      restorePolicy();
      run += 1;
      council?.abort();
      queue.clear();
      recognizer.abort();
      speaker.cancel();
    },
  };
}
