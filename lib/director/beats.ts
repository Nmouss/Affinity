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
  /** Speaks the beat's line, if any. Null (or omitted) means the beat only waits on its timer. */
  voice?: (beat: Beat) => Promise<void> | null;
}

/**
 * Applies beats in order, holding each one on screen for at least its duration. When `voice`
 * returns a promise, the beat also waits for it to settle before advancing — a beat never ends
 * mid-sentence, but a silent beat (voice returns null) behaves exactly as before.
 */
export class BeatQueue {
  private readonly pending: Beat[] = [];
  private current: Beat | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  // Bumped by clear() so a voice promise that resolves after a reset is a no-op.
  private token = 0;

  constructor(private readonly options: BeatQueueOptions) {}

  push(beat: Beat): void {
    this.pending.push(beat);
    if (!this.timer) this.next();
  }

  /** True while a beat is holding (on its timer, its speech, or both) or more are waiting. */
  get busy(): boolean {
    return this.timer !== null || this.pending.length > 0;
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
    this.pending.length = 0;
    this.token += 1;
  }

  private next(): void {
    const beat = this.pending.shift();
    if (!beat) {
      this.timer = null;
      return;
    }
    this.current = beat;
    const token = ++this.token;
    this.options.apply(beat);
    if (this.current !== beat) return; // apply() reset the stage and cleared the queue

    let timerDone = false;
    let voiceDone = false;
    const tryAdvance = () => {
      if (token !== this.token || !timerDone || !voiceDone) return;
      const finished = this.current;
      this.current = null;
      this.timer = null;
      if (finished) this.options.onBeatEnd?.(finished);
      this.next();
    };

    const hold = Math.max(0, this.options.durations()[beatKey(beat)]);
    this.timer = setTimeout(() => {
      timerDone = true;
      tryAdvance();
    }, hold);

    const speaking = this.options.voice?.(beat) ?? null;
    if (speaking === null) {
      voiceDone = true;
    } else {
      // A stuck utterance can't stall the show forever: the speaker's own safety timeout resolves it.
      speaking.then(() => {
        voiceDone = true;
        tryAdvance();
      });
    }
  }
}
