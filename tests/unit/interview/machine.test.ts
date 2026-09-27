import { describe, expect, it } from "vitest";
import {
  currentQuestion,
  initialInterviewState,
  interviewReducer,
  NOTICES,
  progress,
  QUESTIONS,
  type Effect,
  type ExtractedPreferences,
  type InterviewEvent,
  type InterviewState,
  extractLocally,
} from "@/lib/interview";

const VOICE = { canSpeak: true, canListen: true };
const TYPED_ONLY = { canSpeak: false, canListen: false };
const NAME = { name: "Ava" };

const RESULT: ExtractedPreferences = { loves: ["hiking", "books"], avoids: ["gambling"], personality: ["outdoorsy"], summary: "Ava is into hiking and books.", source: "local" };

/** Drives the reducer and collects every effect, like the hook does. */
function harness(capabilities = VOICE) {
  let state: InterviewState = initialInterviewState();
  const effects: Effect[] = [];
  const send = (event: InterviewEvent) => {
    const step = interviewReducer(state, event, NAME);
    state = step.state;
    effects.push(...step.effects);
    return step;
  };
  send({ type: "start", capabilities });
  return { send, get state() { return state; }, effects, types: () => effects.map((effect) => effect.type) };
}

/** Speaks the intro/question, listens, hears `text`, stops on silence, and delivers the final. */
function answerByVoice(h: ReturnType<typeof harness>, text: string) {
  h.send({ type: "speakEnd" });
  expect(h.state.phase).toBe("listening");
  h.send({ type: "speechStart" });
  h.send({ type: "interim", text: text.slice(0, 4) });
  h.send({ type: "silence" });
  h.send({ type: "final", text });
}

describe("voice path", () => {
  it("walks intro, the open prompt, extraction, review, and save with the expected effects", () => {
    const h = harness();
    expect(h.state.phase).toBe("intro");
    expect(h.effects[0]).toEqual({ type: "speak", text: expect.stringContaining("Ava") });

    h.send({ type: "speakEnd" }); // intro done -> the prompt is spoken
    expect(h.state.phase).toBe("asking");
    expect(currentQuestion(h.state)?.id).toBe("about");
    expect(progress(h.state)).toEqual({ index: 0, total: 1 });
    answerByVoice(h, "went hiking and I read a lot of books, but I would never spend money on gambling");
    expect(h.state.answers[0]).toContain("went hiking");
    expect(h.state.phase).toBe("extracting");

    h.send({
      type: "extracted",
      result: extractLocally("Ava", [{ questionId: "about", question: QUESTIONS[0]!.spoken, answer: h.state.answers[0]!, feeds: "loves" }]),
    });
    expect(h.state.phase).toBe("review");
    h.send({ type: "addChip", list: "loves", value: "Cooking." });
    h.send({ type: "addChip", list: "loves", value: "hiking" }); // duplicate ignored
    expect(h.state.result).toMatchObject({ loves: ["hiking", "books", "cooking"], avoids: ["gambling"] });
    h.send({ type: "save" });
    expect(h.state.phase).toBe("finished");
    expect(h.effects.at(-1)).toMatchObject({ type: "finish", result: { loves: ["hiking", "books", "cooking"], avoids: ["gambling"] } });

    const spoken = h.effects.filter((effect) => effect.type === "speak").length;
    expect(spoken).toBe(1 + QUESTIONS.length + 1); // intro, the prompt, closing
    expect(h.effects.filter((effect) => effect.type === "listen")).toHaveLength(QUESTIONS.length);
  });

  it("stops listening once even when silence and Done both arrive", () => {
    const h = harness();
    h.send({ type: "speakEnd" });
    h.send({ type: "speakEnd" });
    h.send({ type: "silence" });
    h.send({ type: "done" });
    h.send({ type: "silence" });
    expect(h.effects.filter((effect) => effect.type === "stopListening")).toHaveLength(1);
    expect(h.state.stopping).toBe(true);
  });

  it("retries once on an empty answer, then moves on", () => {
    const h = harness();
    h.send({ type: "speakEnd" });
    h.send({ type: "speakEnd" });
    h.send({ type: "silence" });
    h.send({ type: "final", text: "   " });
    expect(h.state.phase).toBe("listening");
    expect(h.state.notice).toBe(NOTICES.retry);
    expect(h.state.retries).toBe(1);
    expect(h.effects.filter((effect) => effect.type === "listen")).toHaveLength(2);
    h.send({ type: "silence" });
    h.send({ type: "final", text: "" });
    expect(h.state.answers[0]).toBe("");
    // One prompt: an empty second try goes straight to extraction.
    expect(h.state.phase).toBe("extracting");
    expect(h.state.notice).toBeNull();
  });

  it("switches to typing mid-listen and stays typed for the rest", () => {
    const h = harness();
    h.send({ type: "speakEnd" });
    h.send({ type: "speakEnd" });
    h.send({ type: "useTyping" });
    expect(h.state.phase).toBe("typing");
    expect(h.state.mode).toBe("typed");
    expect(h.effects.at(-1)).toEqual({ type: "stopListening" });
    h.send({ type: "typed", text: "board games" });
    h.send({ type: "submitTyped" });
    expect(h.state.answers[0]).toBe("board games");
    expect(h.state.mode).toBe("typed");
    expect(h.state.phase).toBe("extracting");
    expect(h.effects.filter((effect) => effect.type === "listen")).toHaveLength(1);
  });

  it("falls back to typing on a mic error and ignores an empty typed submit", () => {
    const h = harness();
    h.send({ type: "speakEnd" });
    h.send({ type: "speakEnd" });
    h.send({ type: "micError", code: "not-allowed" });
    expect(h.state.phase).toBe("typing");
    expect(h.state.notice).toBe(NOTICES.micUnavailable);
    expect(h.state.capabilities.canListen).toBe(false);
    h.send({ type: "submitTyped" });
    expect(h.state.phase).toBe("typing");
    h.send({ type: "typed", text: "cooking" });
    h.send({ type: "submitTyped" });
    expect(h.state.answers[0]).toBe("cooking");
    expect(h.state.phase).toBe("extracting");
  });

  it("skips a question while listening, stopping the mic first", () => {
    const h = harness();
    h.send({ type: "speakEnd" });
    h.send({ type: "speakEnd" });
    h.send({ type: "skipQuestion" });
    expect(h.state.answers[0]).toBe("");
    // Skipping the only prompt stops the mic and goes on to the closing line and extraction.
    expect(h.types().slice(-3)).toEqual(["stopListening", "speak", "extract"]);
  });
});

describe("typed-only path", () => {
  it("never speaks or listens and shows the voice-off notice", () => {
    const h = harness(TYPED_ONLY);
    expect(h.state.phase).toBe("typing");
    expect(h.state.notice).toBe(NOTICES.voiceOff);
    expect(h.effects).toEqual([]);
    for (const text of ["a"]) {
      h.send({ type: "typed", text });
      h.send({ type: "submitTyped" });
    }
    expect(h.state.phase).toBe("extracting");
    expect(h.types()).toEqual(["extract"]);
  });

  it("speaks but types when only speech output is available", () => {
    const h = harness({ canSpeak: true, canListen: false });
    expect(h.state.phase).toBe("intro");
    h.send({ type: "speakEnd" });
    expect(h.state.phase).toBe("asking");
    h.send({ type: "speakEnd" });
    expect(h.state.phase).toBe("typing");
  });
});

describe("skip and guards", () => {
  it("skip from any phase cancels and finishes with null", () => {
    const reach = {
      intro: (h: ReturnType<typeof harness>) => h,
      asking: (h: ReturnType<typeof harness>) => (h.send({ type: "speakEnd" }), h),
      listening: (h: ReturnType<typeof harness>) => (h.send({ type: "speakEnd" }), h.send({ type: "speakEnd" }), h),
      extracting: (h: ReturnType<typeof harness>) => {
        for (let i = 0; i < 4; i += 1) {
          h.send({ type: "speakEnd" });
          if (i === 0) h.send({ type: "speakEnd" });
          h.send({ type: "silence" });
          h.send({ type: "final", text: "x" });
        }
        return h;
      },
      review: (h: ReturnType<typeof harness>) => {
        reach.extracting(h);
        h.send({ type: "extracted", result: RESULT });
        return h;
      },
    };
    for (const [phase, drive] of Object.entries(reach)) {
      const h = drive(harness());
      expect(h.state.phase).toBe(phase);
      const before = h.effects.length;
      h.send({ type: "skip" });
      expect(h.state.phase).toBe("finished");
      expect(h.effects.slice(before)).toEqual([{ type: "cancel" }, { type: "finish", result: null }]);
      h.send({ type: "skip" });
      expect(h.effects.length).toBe(before + 2);
    }
  });

  it("ignores events that don't fit the phase and returns the same state object", () => {
    const h = harness();
    const before = h.state;
    for (const event of [
      { type: "final", text: "x" },
      { type: "silence" },
      { type: "submitTyped" },
      { type: "extracted", result: RESULT },
      { type: "save" },
      { type: "removeChip", list: "loves", value: "x" },
      { type: "start", capabilities: VOICE },
    ] as InterviewEvent[]) {
      const step = h.send(event);
      expect(step.state).toBe(before);
      expect(step.effects).toEqual([]);
    }
  });
});
