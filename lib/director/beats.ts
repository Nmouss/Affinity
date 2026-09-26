import type { CouncilEvent } from "@/types/domain";

/** Minimum on-screen time per beat, in ms, so an instant dump from the route still plays as a show. */
export type BeatDurations = Record<CouncilEvent["type"] | "streamEnd", number>;

export const DEFAULT_BEATS: BeatDurations = {
  opinion: 2500,
  constraints: 2000,
  veto: 4500,
  bundle: 5000,
  score: 1500,
  awaiting_mandate: 0,
  receipt: 0,
  streamEnd: 0,
};

/** The 90-second cut: everything tighter, but the veto beat keeps enough time to land. */
export const CUT90_BEATS: BeatDurations = {
  opinion: 1100,
  constraints: 900,
  veto: 3200,
  bundle: 3000,
  score: 600,
  awaiting_mandate: 0,
  receipt: 0,
  streamEnd: 0,
};

export type Beat = { kind: "event"; event: CouncilEvent } | { kind: "streamEnd" };

export function beatKey(beat: Beat): keyof BeatDurations {
  return beat.kind === "event" ? beat.event.type : "streamEnd";
}

export interface BeatQueueOptions {
  apply: (beat: Beat) => void;
  /** Called when a beat's hold time runs out, just before the next beat is applied. */
  onBeatEnd?: (beat: Beat) => void;
  durations: () => BeatDurations;
}

/** Applies beats in order, holding each one on screen for at least its duration. */
export class BeatQueue {
  private readonly pending: Beat[] = [];
  private current: Beat | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: BeatQueueOptions) {}

  push(beat: Beat): void {
    this.pending.push(beat);
    if (!this.timer) this.next();
  }

  /** True while a beat is holding or more are waiting. */
  get busy(): boolean {
    return this.timer !== null || this.pending.length > 0;
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
    this.pending.length = 0;
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
    const hold = Math.max(0, this.options.durations()[beatKey(beat)]);
    this.timer = setTimeout(() => {
      const finished = this.current;
      this.current = null;
      if (finished) this.options.onBeatEnd?.(finished);
      this.next();
    }, hold);
  }
}
