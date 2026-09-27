import { typingDuration } from "@/components/sprites/typewriter";
import type { CouncilEvent } from "@/types/domain";

/** Minimum on-screen time per beat, in ms, so an instant dump from the route still plays as a show. */
export type BeatDurations = Record<CouncilEvent["type"] | "streamEnd", number>;

/** Extra time after a line finishes typing so a person can read it before the next speaker. */
export const READ_PAUSE_MS = 2200;
export const CUT90_READ_PAUSE_MS = 800;

export const DEFAULT_BEATS: BeatDurations = {
  mission: 0,
  opinion: 2500,
  deliberation: 2200,
  constraints: 2000,
  consensus: 1200,
  search_plan: 800,
  veto: 4500,
  bundle: 5000,
  plan: 5000,
  score: 1500,
  revision: 1000,
  scores_complete: 0,
  awaiting_mandate: 0,
  repair_requested: 0,
  repair: 1000,
  preflight: 0,
  receipt: 0,
  carts: 0,
  notifications: 0,
  error: 0,
  run_state: 0,
  streamEnd: 0,
};

/** The 90-second cut: everything tighter, but the veto beat keeps enough time to land. */
export const CUT90_BEATS: BeatDurations = {
  mission: 0,
  opinion: 1100,
  deliberation: 900,
  constraints: 900,
  consensus: 500,
  search_plan: 400,
  veto: 3200,
  bundle: 3000,
  plan: 3000,
  score: 600,
  revision: 500,
  scores_complete: 0,
  awaiting_mandate: 0,
  repair_requested: 0,
  repair: 500,
  preflight: 0,
  receipt: 0,
  carts: 0,
  notifications: 0,
  error: 0,
  run_state: 0,
  streamEnd: 0,
};

export type Beat = { kind: "event"; event: CouncilEvent } | { kind: "streamEnd" };

export function beatKey(beat: Beat): keyof BeatDurations {
  return beat.kind === "event" ? beat.event.type : "streamEnd";
}

export function eventSay(event: CouncilEvent): string | undefined {
  const payload = event.payload;
  if (payload && typeof payload === "object" && "say" in payload && typeof payload.say === "string") {
    return payload.say;
  }
  return undefined;
}

/** Hold at least the beat floor, and for spoken lines wait until typing plus a read pause. */
export function speechHoldMs(say: string | undefined, baseMs: number, readPauseMs = READ_PAUSE_MS): number {
  const floor = Math.max(0, baseMs);
  if (!say) return floor;
  return Math.max(floor, Math.ceil(typingDuration(say) * 1000) + readPauseMs);
}

export function beatHoldMs(beat: Beat, durations: BeatDurations, readPauseMs = READ_PAUSE_MS): number {
  const base = Math.max(0, durations[beatKey(beat)]);
  if (beat.kind !== "event") return base;
  return speechHoldMs(eventSay(beat.event), base, readPauseMs);
}

export interface BeatQueueOptions {
  apply: (beat: Beat) => void;
  /** Called when a beat's hold time runs out, just before the next beat is applied. */
  onBeatEnd?: (beat: Beat) => void;
  durations: () => BeatDurations;
  readPauseMs?: () => number;
}

/** Applies beats in order, holding each one on screen for at least its duration. */
export class BeatQueue {
  private readonly pending: Beat[] = [];
  private current: Beat | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Holds are divided by this: 1 is the show as written, larger is fast-forward. */
  private speed = 1;
  private holdEndsAt = 0;

  constructor(private readonly options: BeatQueueOptions) {}

  push(beat: Beat): void {
    this.pending.push(beat);
    if (!this.timer) this.next();
  }

  /** True while a beat is holding or more are waiting. */
  get busy(): boolean {
    return this.timer !== null || this.pending.length > 0;
  }

  get pace(): number {
    return this.speed;
  }

  /**
   * Fast-forward: every hold (including the one in progress) is divided by `factor`. The remaining
   * part of the current hold is rescheduled so pressing the button is felt at once.
   */
  setSpeed(factor: number): void {
    const next = Number.isFinite(factor) && factor >= 1 ? factor : 1;
    if (next === this.speed) return;
    const previous = this.speed;
    this.speed = next;
    if (!this.timer) return;
    const remaining = Math.max(0, this.holdEndsAt - Date.now()) * (previous / next);
    clearTimeout(this.timer);
    this.schedule(remaining);
  }

  /** Skip the talk: end the current hold and apply everything already waiting, in order, right now. */
  skip(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      const finished = this.current;
      this.current = null;
      if (finished) this.options.onBeatEnd?.(finished);
    }
    while (this.pending.length > 0) {
      const beat = this.pending.shift()!;
      this.current = beat;
      this.options.apply(beat);
      if (this.current !== beat) return; // apply() reset the stage and cleared the queue
      this.current = null;
      this.options.onBeatEnd?.(beat);
    }
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
    this.pending.length = 0;
    this.speed = 1;
  }

  private schedule(hold: number): void {
    this.holdEndsAt = Date.now() + hold;
    this.timer = setTimeout(() => {
      const finished = this.current;
      this.current = null;
      if (finished) this.options.onBeatEnd?.(finished);
      this.next();
    }, hold);
  }

  private next(): void {
    const beat = this.pending.shift();
    if (!beat) {
      this.timer = null;
      return;
    }
    this.current = beat;
    this.options.apply(beat);
    if (this.current !== beat) return; // apply() reset the stage and cleared the queue
    const hold = beatHoldMs(beat, this.options.durations(), this.options.readPauseMs?.() ?? READ_PAUSE_MS) / this.speed;
    this.schedule(hold);
  }
}
