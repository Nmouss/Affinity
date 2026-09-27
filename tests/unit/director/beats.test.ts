import { describe, expect, it } from "vitest";
import { DEFAULT_BEATS, READ_PAUSE_MS, beatHoldMs, speechHoldMs } from "@/lib/director/beats";
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
