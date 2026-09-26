import type { StoreApi } from "zustand";
import { signMandate } from "@/lib/crypto/sign";
import { emitGesture, onGesture, setArmingPolicy } from "@/lib/stage/bus";
import { COUNCIL_RING } from "@/lib/stage/layout";
import type { StageStore } from "@/lib/stage/store";
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
}

export interface Director {
  /** Overrides individual beat durations (leva tuning in /lab). */
  tuneBeats: (patch: Partial<BeatDurations>) => void;
  readonly beats: BeatDurations;
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

  // Bumped on every reset so async work from an older run can tell it has been superseded.
  let run = 0;
  let council: AbortController | null = null;

  const applyBeat = (beat: Beat) => {
    if (beat.kind === "streamEnd") {
      if (get().phase !== "awaitMandate") get().advancePhase("streamEnd");
      return;
    }
    get().applyCouncilEvent(beat.event);
  };

  const queue = new BeatQueue({
    apply: applyBeat,
    durations: () => beats,
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
    const state = get();
    state.resetCouncil();
    state.resetHand();
    state.resetScene();
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
      case "talkStart":
      case "talkEnd":
      case "toggleVoiceMute":
        // Voice wiring lands with the director voice track.
        return;
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
    dispose: () => {
      unsubscribe();
      restorePolicy();
      run += 1;
      council?.abort();
      queue.clear();
    },
  };
}
