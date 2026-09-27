import { describe, expect, it, vi } from "vitest";
import { BeatQueue, DEFAULT_BEATS, READ_PAUSE_MS, beatHoldMs, speechHoldMs } from "@/lib/director/beats";
import { typingDuration } from "@/components/sprites/typewriter";

describe("speechHoldMs", () => {
  it("keeps the floor when there is no spoken line", () => {
    expect(speechHoldMs(undefined, 2500)).toBe(2500);
  });

  it("waits for typing plus a read pause so the next speaker does not overlap", () => {
    const say = "Something practical and well-made, please—and let's keep it under $25.";
    const expected = Math.ceil(typingDuration(say) * 1000) + READ_PAUSE_MS;
    expect(speechHoldMs(say, 2500)).toBe(expected);
    expect(expected).toBeGreaterThan(2500);
  });

  it("uses the longer of the beat floor and the read time", () => {
    expect(speechHoldMs("Hi.", 8000)).toBe(8000);
  });
});

describe("beatHoldMs", () => {
  it("extends opinion beats from the spoken line", () => {
    const event = {
      type: "opinion" as const,
      payload: {
        spriteId: "wife",
        say: "Let's take a breath before the next person talks.",
        hardRules: [],
        wishes: [],
        vetoes: [],
      },
    };
    expect(beatHoldMs({ kind: "event", event }, DEFAULT_BEATS)).toBe(speechHoldMs(event.payload.say, DEFAULT_BEATS.opinion));
  });
});

describe("BeatQueue pace and skip", () => {
  const opinion = (say: string) => ({
    kind: "event" as const,
    event: { type: "opinion" as const, payload: { spriteId: "wife", say, hardRules: [], wishes: [], vetoes: [] } },
  });
  const flat = { ...DEFAULT_BEATS, opinion: 1000, constraints: 1000 };

  it("divides holds by the speed, including the hold already in progress", async () => {
    vi.useFakeTimers();
    const applied: string[] = [];
    const queue = new BeatQueue({ apply: (beat) => applied.push(beat.kind === "event" ? beat.event.type : "end"), durations: () => flat, readPauseMs: () => 0 });
    queue.push(opinion("Hi."));
    queue.push({ kind: "event", event: { type: "constraints", payload: { hardRules: [], wishes: [], conflicts: [] } } });
    expect(applied).toEqual(["opinion"]);
    await vi.advanceTimersByTimeAsync(500);
    queue.setSpeed(2); // 500 ms left becomes 250 ms
    await vi.advanceTimersByTimeAsync(249);
    expect(applied).toEqual(["opinion"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(applied).toEqual(["opinion", "constraints"]);
    expect(queue.pace).toBe(2);
    queue.clear();
    expect(queue.pace).toBe(1);
    vi.useRealTimers();
  });

  it("skip applies everything waiting at once and reports each finished beat", async () => {
    vi.useFakeTimers();
    const applied: string[] = [];
    const ended: string[] = [];
    const queue = new BeatQueue({
      apply: (beat) => applied.push(beat.kind === "event" ? beat.event.type : "end"),
      onBeatEnd: (beat) => ended.push(beat.kind === "event" ? beat.event.type : "end"),
      durations: () => flat,
      readPauseMs: () => 0,
    });
    queue.push(opinion("One."));
    queue.push(opinion("Two."));
    queue.push({ kind: "streamEnd" });
    expect(applied).toEqual(["opinion"]);
    queue.skip();
    expect(applied).toEqual(["opinion", "opinion", "end"]);
    expect(ended).toEqual(["opinion", "opinion", "end"]);
    expect(queue.busy).toBe(false);
    // Whatever arrives later still plays, at the current pace.
    queue.setSpeed(10);
    queue.push(opinion("Three."));
    expect(applied).toHaveLength(4);
    vi.useRealTimers();
  });
});
