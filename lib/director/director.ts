import type { StoreApi } from "zustand";
import { signMandate, signPlanMandate } from "@/lib/crypto/sign";
import { emitGesture, onGesture, setArmingPolicy } from "@/lib/stage/bus";
import { MAX_SEATS } from "@/lib/stage/layout";
import { getPerson } from "@/lib/people/roster";
import type { StageStore } from "@/lib/stage/store";
import type { Bundle, CartMandate, FamilyProfile, Mission } from "@/types/domain";
import type { GestureEvent } from "@/types/stage";
import { isGestureArmed, type ArmingContext } from "./arming";
import {
  BeatQueue,
  CUT90_BEATS,
  CUT90_READ_PAUSE_MS,
  DEFAULT_BEATS,
  READ_PAUSE_MS,
  type Beat,
  type BeatDurations,
} from "./beats";
import { runCouncil, type CouncilRunOptions } from "./councilClient";
import { classifyEnvironment } from "./environmentClassifier";
import { buildMission } from "./mission";
import { readSseStream } from "./sse";

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

/** After a skip, anything still arriving from the backend plays at this pace instead of the full show. */
export const SKIP_PACE = 12;
export const FAST_FORWARD_PACE = 3;

export interface Director {
  /** Overrides individual beat durations (leva tuning in /lab). */
  tuneBeats: (patch: Partial<BeatDurations>) => void;
  readonly beats: BeatDurations;
  /** Asks the backend to replace one cart item with a different option for the same slot. */
  swapItem: (itemId: string, prompt?: string) => Promise<void>;
  /** Permanently rejects the current proposal; the backend creates no merchant carts. */
  cancelProposal: (itemId: string) => Promise<void>;
  /** Fast-forward the council's talk: holds are divided by this (1 = normal). Reset returns to 1. */
  setPace: (factor: number) => void;
  /** Skip the talk: apply every waiting beat now and keep the rest of this run at a brisk pace. */
  skipTalk: () => void;
  dispose: () => void;
}

/** The ring's total capacity, not how many seats are currently spread out (see lib/stage/layout.ts's
 *  activeSeatCount for that). */
const SEAT_COUNT = MAX_SEATS;

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
    readPauseMs: () => (options.cut90 ? CUT90_READ_PAUSE_MS : READ_PAUSE_MS),
    onBeatEnd: (beat) => {
      if (beat.kind === "event" && (beat.event.type === "opinion" || beat.event.type === "deliberation")) {
        const id = beat.event.payload.spriteId;
        if (get().sprites[id]?.mood === "speaking") get().setSpriteMood(id, "listening");
      }
    },
  });

  async function convene() {
    const state = get();
    const invited = seatedInOrder(state);
    const mission = buildMission(state.missionText, invited, { recipientIds: state.recipientIds });
    const profiles = invited.map((id) => getPerson(id)).filter((p): p is FamilyProfile => p != null);
    const threadId = crypto.randomUUID();
    const runId = ++run;
    council?.abort();
    council = new AbortController();
    state.setMission(mission);
    state.setThreadId(threadId);
    state.setError(null);
    state.openProfile(null);
    state.setScene({ environment: classifyEnvironment(mission.freeText) });
    state.advancePhase("convene");
    for (const id of invited) state.setSpriteMood(id, "thinking");

    const runOptions: CouncilRunOptions = {
      signal: council.signal,
      threadId,
      preferReplay: options.preferReplay,
      stallMs: options.stallMs,
      replaySpeed: options.cut90 ? 2 : 1,
      fetchImpl,
      onSource: (source) => runId === run && get().setCouncilSource(source),
      onFallback: (reason) => log(`falling back to replay: ${reason}`),
    };
    try {
      for await (const event of runCouncil(mission, profiles, runOptions)) {
        if (runId !== run) return;
        // Session identity and failures are control-plane state, not theatrical beats. Applying
        // them immediately prevents a user action from racing the paced animation queue.
        if (event.type === "run_state" || event.type === "error") get().applyCouncilEvent(event);
        else queue.push({ kind: "event", event });
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
    const plan = state.plan;
    const threadId = state.threadId;
    if ((!bundle && !plan) || !threadId) {
      state.setError("The proposal is not ready to approve yet.");
      return;
    }
    const mission =
      state.mission ??
      buildMission(state.missionText, [...new Set([...seatedInOrder(state), ...Object.keys(state.opinions)])], {
        recipientIds: state.recipientIds,
      });
    const runId = run;
    state.setError(null);
    state.advancePhase("handshakeComplete");
    try {
      const mandate = plan ? await signPlanMandate(mission, plan) : await sign(mission, bundle!);
      state.setMandate(mandate);
      const verification = await fetchImpl("/api/mandate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mandate),
      });
      const verified = (await verification.json().catch(() => ({}))) as { valid?: boolean };
      if (runId !== run) return;
      if (!verified.valid) {
        get().advancePhase("mandateRejected");
        get().setError("The mandate signature was rejected. Shake again to retry.");
        return;
      }

      const response = await fetchImpl("/api/council/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ threadId, action: "approve", signature: mandate.signature }),
      });
      if (!response.ok || !response.body) throw new Error(`Approval resume failed (${response.status})`);
      for await (const event of readSseStream(response.body)) {
        if (runId !== run) return;
        if (event.type === "run_state" || event.type === "error") get().applyCouncilEvent(event);
        else queue.push({ kind: "event", event });
      }
    } catch (error) {
      if (runId !== run) return;
      get().advancePhase("mandateRejected");
      get().setError(error instanceof Error ? `Signing failed: ${error.message}` : "Signing failed");
    }
  }

  async function swapItem(itemId: string, prompt?: string) {
    const state = get();
    const threadId = state.threadId;
    if (!threadId) {
      log("swap requested with no threadId (live backend session not established)", itemId);
      state.setError("Can't swap yet — the council session hasn't started.");
      return;
    }
    const runId = run;
    state.setError(null);
    try {
      const response = await fetchImpl("/api/council/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ threadId, action: "replace_agent", itemId, prompt }),
      });
      if (!response.ok || !response.body) throw new Error(`Swap request failed (${response.status})`);
      for await (const event of readSseStream(response.body)) {
        if (runId !== run) return;
        if (event.type === "run_state" || event.type === "error") get().applyCouncilEvent(event);
        else queue.push({ kind: "event", event });
      }
    } catch (error) {
      if (runId !== run) return;
      get().setError(error instanceof Error ? `Swap failed: ${error.message}` : "Swap failed");
    }
  }

  async function cancelProposal(itemId: string) {
    const state = get();
    const threadId = state.threadId;
    if (!threadId) {
      state.setError("Can't cancel yet — the council session hasn't started.");
      return;
    }
    const runId = run;
    state.setError(null);
    try {
      const response = await fetchImpl("/api/council/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ threadId, action: "reject", itemId }),
      });
      if (!response.ok || !response.body) throw new Error(`Cancellation failed (${response.status})`);
      for await (const event of readSseStream(response.body)) {
        if (runId !== run) return;
        if (event.type === "run_state" || event.type === "error") get().applyCouncilEvent(event);
        else queue.push({ kind: "event", event });
      }
    } catch (error) {
      if (runId !== run) return;
      get().setError(error instanceof Error ? `Cancellation failed: ${error.message}` : "Cancellation failed");
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
          if (state.phase === "lobby") state.openProfile(state.profileOpenId === id ? null : id);
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
      case "reset":
        reset();
        return;
      case "swipe":
        void swapItem(event.itemId);
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
    swapItem,
    cancelProposal,
    setPace: (factor) => queue.setSpeed(factor),
    skipTalk: () => {
      queue.skip();
      queue.setSpeed(SKIP_PACE);
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
