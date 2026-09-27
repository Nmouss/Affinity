import type { StoreApi } from "zustand";
import { signMandate } from "@/lib/crypto/sign";
import { runtimeProfilesFor } from "@/lib/people/runtimeProfile";
import { emitGesture, onGesture, setArmingPolicy } from "@/lib/stage/bus";
import { MAX_SEATS } from "@/lib/stage/layout";
import type { StageStore } from "@/lib/stage/store";
import type { Bundle, CartMandate, CouncilEvent, Mission, ResumeAction, RuntimeProfile, StartRunRequest } from "@/types/domain";
import type { GestureEvent } from "@/types/stage";
import { isGestureArmed, type ArmingContext } from "./arming";
import { BeatQueue, CUT90_BEATS, DEFAULT_BEATS, type Beat, type BeatDurations } from "./beats";
import { resumeCouncil, runCouncil, type CouncilRunOptions } from "./councilClient";
import { buildMission } from "./mission";

// The director sits between the hands and the agents: it decides what each armed gesture means in the
// current phase, runs the council on the Python backend, and paces its events into beats so stage
// timing never depends on LLM speed. Approval, replacement, and decline all resume the same thread.

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
  /** Runtime profiles for the invited ids; defaults to the roster mapper. */
  profiles?: (ids: string[]) => RuntimeProfile[];
  /** Thread id factory (tests pin it). */
  threadId?: () => string;
  log?: (message: string, detail?: unknown) => void;
}

export interface Director {
  /** Overrides individual beat durations (leva tuning in /lab). */
  tuneBeats: (patch: Partial<BeatDurations>) => void;
  readonly beats: BeatDurations;
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

function newThreadId(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `affinity-${random}`;
}

/** What resumed the thread last, so a failed segment can be retried against the same checkpoint. */
type LastRequest = { kind: "start"; envelope: StartRunRequest } | { kind: "resume"; action: ResumeAction };

export function createDirector(options: DirectorOptions): Director {
  const { store } = options;
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const sign = options.sign ?? signMandate;
  const profilesFor = options.profiles ?? ((ids: string[]) => runtimeProfilesFor(ids));
  const threadIdFor = options.threadId ?? newThreadId;
  const log = options.log ?? ((message: string, detail?: unknown) => console.info(`[director] ${message}`, detail ?? ""));
  const beats: BeatDurations = { ...(options.cut90 ? CUT90_BEATS : DEFAULT_BEATS) };
  const get = () => store.getState();

  // Bumped on every reset so async work from an older run can tell it has been superseded.
  let run = 0;
  let council: AbortController | null = null;
  let last: LastRequest | null = null;
  // The room's veto beat is synthesized from the first constraints conflict on the live path; the
  // replay transcript carries its own veto event, so only one may play per council.
  let vetoPlayed = false;

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
      if (beat.kind === "event" && (beat.event.type === "opinion" || beat.event.type === "deliberation")) {
        const id = beat.event.payload.spriteId;
        if (get().sprites[id]?.mood === "speaking") get().setSpriteMood(id, "listening");
      }
    },
  });

  const parser = {
    onUnknown: (type: string) => log(`ignoring unknown council event "${type}"`),
    onMalformed: (type: string) => log(`skipping malformed "${type}" payload`),
  };

  function enqueue(event: CouncilEvent) {
    if (event.type === "veto") {
      if (vetoPlayed) return;
      vetoPlayed = true;
    }
    queue.push({ kind: "event", event });
    if (event.type === "constraints" && !vetoPlayed && event.payload.conflicts.length > 0) {
      vetoPlayed = true;
      queue.push({ kind: "event", event: { type: "veto", payload: event.payload.conflicts[0]! } });
    }
  }

  function startEnvelope(mission: Mission): StartRunRequest {
    return { threadId: threadIdFor(), mission, profiles: profilesFor(mission.invitedSpriteIds) };
  }

  async function start(envelope: StartRunRequest) {
    const state = get();
    const runId = ++run;
    council?.abort();
    council = new AbortController();
    last = { kind: "start", envelope };
    vetoPlayed = false;
    state.setThread(envelope.threadId);
    state.setRunStatus("running");
    state.setError(null);
    state.setNotice(null);

    const runOptions: CouncilRunOptions = {
      signal: council.signal,
      preferReplay: options.preferReplay,
      stallMs: options.stallMs,
      replaySpeed: options.cut90 ? 2 : 1,
      fetchImpl,
      parser,
      onSource: (source) => {
        if (runId !== run) return;
        get().setCouncilSource(source);
        // The replay is a recorded demo, not this thread: its bundle can never resume the backend.
        if (source === "replay") get().setThread(null);
      },
      onFallback: (reason) => log(`falling back to replay: ${reason}`),
    };
    try {
      for await (const event of runCouncil(envelope, runOptions)) {
        if (runId !== run) return;
        enqueue(event);
      }
      if (runId === run) queue.push({ kind: "streamEnd" });
    } catch (error) {
      if (runId !== run || council?.signal.aborted) return;
      get().setError(error instanceof Error ? error.message : "The council could not be reached", true);
      get().setRunStatus("error");
    }
  }

  async function convene() {
    const state = get();
    const invited = seatedInOrder(state);
    const mission = state.mission?.type === "gift" && state.phase === "lobby" ? state.mission : buildMission(state.missionText, invited);
    state.setMission(mission);
    state.openProfile(null);
    state.advancePhase("convene");
    for (const id of mission.invitedSpriteIds) state.setSpriteMood(id, "thinking");
    await start(startEnvelope(mission));
  }

  /** Resumes the current thread. Only the live backend can do this; a replayed demo has no thread. */
  async function resume(action: ResumeAction) {
    const state = get();
    const threadId = state.threadId;
    if (!threadId) {
      state.setError(
        state.councilSource === "replay"
          ? "This was the recorded demo, so there is no live council to approve. Reset and run it live."
          : "The council thread is gone. Reset and start the mission again.",
      );
      if (state.phase === "signing") state.advancePhase("mandateRejected");
      return;
    }
    const runId = run;
    council?.abort();
    council = new AbortController();
    last = { kind: "resume", action };
    state.setError(null);
    state.setRunStatus("running");
    try {
      const stream = resumeCouncil({ threadId, ...action }, council.signal, fetchImpl, parser);
      let received = false;
      for await (const event of stream) {
        if (runId !== run) return;
        received = true;
        enqueue(event);
      }
      if (runId !== run) return;
      if (!received) throw new Error("The council backend closed the stream without answering");
      queue.push({ kind: "streamEnd" });
    } catch (error) {
      if (runId !== run || council?.signal.aborted) return;
      const message = error instanceof Error ? error.message : "The council could not be reached";
      get().setError(message, true);
      get().setRunStatus("error");
      if (get().phase === "signing") get().advancePhase("mandateRejected");
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
    state.setNotice(null);
    state.advancePhase("handshakeComplete");
    let signature: string;
    try {
      const mandate = await sign(mission, bundle);
      if (runId !== run) return;
      get().setMandate(mandate);
      signature = mandate.signature;
    } catch (error) {
      // The device key is a nice-to-have proof; the backend only needs a non-empty attestation.
      log("signing unavailable; sending a plain handshake attestation", error);
      signature = `handshake:${now()}`;
    }
    if (!signature) signature = `handshake:${now()}`;
    await resume({ action: "approve", signature });
  }

  async function replace(itemId: string, prompt?: string) {
    const state = get();
    if (!state.bundle?.items.some((item) => item.id === itemId)) return;
    state.setNotice("Asking the council for a replacement…");
    state.setParticipantMoods("thinking");
    await resume(prompt?.trim() ? { action: "replace_agent", itemId, prompt: prompt.trim() } : { action: "replace_agent", itemId });
  }

  async function decline() {
    const state = get();
    const itemId = state.bundle?.items[0]?.id;
    if (!itemId) return;
    state.setNotice("Declining the proposal…");
    await resume({ action: "reject", itemId });
  }

  async function retry() {
    const state = get();
    if (!last || state.runStatus !== "error") return;
    if (last.kind === "resume") {
      if (state.threadId) {
        if (state.phase === "awaitMandate" && last.action.action === "approve") state.advancePhase("handshakeComplete");
        await resume(last.action);
        return;
      }
      state.setError("The council thread is gone. Reset and start the mission again.");
      return;
    }
    // A failed start gets a fresh thread; the backend never saw (or has forgotten) the old one.
    for (const id of last.envelope.mission.invitedSpriteIds) state.setSpriteMood(id, "thinking");
    await start({ ...last.envelope, threadId: threadIdFor() });
  }

  function reset() {
    run += 1;
    council?.abort();
    council = null;
    last = null;
    vetoPlayed = false;
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
      case "swipe":
        void replace(event.itemId, event.prompt);
        return;
      case "reject":
        void decline();
        return;
      case "retry":
        void retry();
        return;
      case "toggleReasoning":
        state.toggleReasoning();
        return;
      case "reset":
        reset();
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
