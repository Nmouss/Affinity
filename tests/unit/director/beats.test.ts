import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BeatQueue, DEFAULT_BEATS, type Beat } from "@/lib/director/beats";

/** A minimal well-typed "opinion" beat; the exact payload doesn't matter to the queue itself. */
function opinionBeat(spriteId = "son"): Beat {
  return {
    kind: "event",
    event: { type: "opinion", payload: { spriteId, say: "hi", hardRules: [], wishes: [], vetoes: [] } },
  };
}

/** All beats in this file are opinionBeat()s; narrows past the CouncilEvent payload union. */
function spriteIdOf(beat: Beat): string {
  return beat.kind === "event" && beat.event.type === "opinion" ? beat.event.payload.spriteId : "streamEnd";
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

/** A mutable box for a promise's resolve function — plain `let` + closure assignment confuses
 * TS's control-flow narrowing into `never` at the read site, so we box it instead. */
function deferred(): { resolve: () => void; promise: Promise<void> } {
  const box: { resolve: () => void } = { resolve: () => undefined };
  const promise = new Promise<void>((resolve) => {
    box.resolve = resolve;
  });
  return { promise, resolve: () => box.resolve() };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BeatQueue voice gating", () => {
  it("advances on the timer alone when voice returns null (old behavior)", async () => {
    const applied: Beat[] = [];
    const ended: Beat[] = [];
    const beat = opinionBeat();
    const queue = new BeatQueue({
      apply: (b) => applied.push(b),
      onBeatEnd: (b) => ended.push(b),
      durations: () => DEFAULT_BEATS,
      voice: () => null,
    });
    queue.push(beat);
    expect(applied).toEqual([beat]);
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.opinion - 1);
    expect(ended).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(ended).toEqual([beat]);
    expect(queue.busy).toBe(false);
  });

  it("holds a beat until both the timer and the voice promise settle", async () => {
    const ended: Beat[] = [];
    const voice = deferred();
    const queue = new BeatQueue({
      apply: () => undefined,
      onBeatEnd: (b) => ended.push(b),
      durations: () => DEFAULT_BEATS,
      voice: () => voice.promise,
    });
    const beat = opinionBeat();
    queue.push(beat);

    // The timer alone fires well before the (still-pending) speech does.
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.opinion);
    expect(ended).toEqual([]);
    expect(queue.busy).toBe(true);

    voice.resolve();
    await flushMicrotasks();
    expect(ended).toEqual([beat]);
    expect(queue.busy).toBe(false);
  });

  it("holds a beat until the timer fires, even once speech resolves first", async () => {
    const ended: Beat[] = [];
    const queue = new BeatQueue({
      apply: () => undefined,
      onBeatEnd: (b) => ended.push(b),
      durations: () => DEFAULT_BEATS,
      voice: () => Promise.resolve(),
    });
    const beat = opinionBeat();
    queue.push(beat);
    await flushMicrotasks();
    expect(ended).toEqual([]); // speech settled instantly, but the hold timer hasn't fired yet

    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.opinion - 1);
    expect(ended).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(ended).toEqual([beat]);
  });

  it("ignores a voice promise that resolves after clear()", async () => {
    const ended: Beat[] = [];
    const voice = deferred();
    const queue = new BeatQueue({
      apply: () => undefined,
      onBeatEnd: (b) => ended.push(b),
      durations: () => DEFAULT_BEATS,
      voice: () => voice.promise,
    });
    queue.push(opinionBeat());
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.opinion); // timer fires; still waiting on speech
    queue.clear();
    expect(queue.busy).toBe(false);

    voice.resolve();
    await flushMicrotasks();
    expect(ended).toEqual([]); // the late resolution is a no-op
    expect(queue.busy).toBe(false);
  });

  it("still applies the next beat only after onBeatEnd, in order, across mixed voiced/silent beats", async () => {
    const applied: string[] = [];
    const ended: string[] = [];
    const voice = deferred();
    const queue = new BeatQueue({
      apply: (b) => applied.push(spriteIdOf(b)),
      onBeatEnd: (b) => ended.push(spriteIdOf(b)),
      durations: () => DEFAULT_BEATS,
      voice: (b) => (spriteIdOf(b) === "son" ? voice.promise : null),
    });
    queue.push(opinionBeat("son"));
    queue.push(opinionBeat("wife"));

    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.opinion);
    expect(applied).toEqual(["son"]); // wife's beat hasn't been applied — still waiting on son's speech
    expect(ended).toEqual([]);

    voice.resolve();
    await flushMicrotasks();
    expect(ended).toEqual(["son"]);
    expect(applied).toEqual(["son", "wife"]);

    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.opinion);
    expect(ended).toEqual(["son", "wife"]);
  });

  it("still advances zero-duration beats asynchronously (matches the old setTimeout(0) behavior)", async () => {
    const ended: Beat[] = [];
    const beat = opinionBeat();
    const queue = new BeatQueue({
      apply: () => undefined,
      onBeatEnd: (b) => ended.push(b),
      durations: () => ({ ...DEFAULT_BEATS, opinion: 0 }),
      voice: () => null,
    });
    queue.push(beat);
    expect(ended).toEqual([]); // still async even with a 0 ms hold
    await vi.advanceTimersByTimeAsync(0);
    expect(ended).toEqual([beat]);
  });

  it("preserves the apply()-reset guard: a beat that clears itself during apply schedules nothing", async () => {
    const ended: Beat[] = [];
    const voice = vi.fn(() => Promise.resolve());
    const queue = new BeatQueue({
      apply: () => queue.clear(),
      onBeatEnd: (b) => ended.push(b),
      durations: () => DEFAULT_BEATS,
      voice,
    });
    queue.push(opinionBeat());
    expect(queue.busy).toBe(false);
    expect(voice).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ended).toEqual([]);
  });
});
