import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as councilRoute } from "@/app/api/council/route";
import { POST as mandateRoute } from "@/app/api/mandate/route";
import { STAGE_TIMELINE, STAGE_TRANSCRIPT } from "@/lib/demo/stageTranscript";
import { CUT90_BEATS, DEFAULT_BEATS } from "@/lib/director/beats";
import { createDirector, type Director, type DirectorOptions } from "@/lib/director/director";
import { emitGesture } from "@/lib/stage/bus";
import { useStage } from "@/lib/stage/store";
import type { Recognizer, RecognizerHandlers, Speaker } from "@/lib/voice/types";
import type { CouncilEvent } from "@/types/domain";

const state = () => useStage.getState();

/** A controllable fake Recognizer: tests fire onInterim/onFinal/onError by hand instead of using SpeechRecognition. */
function createFakeRecognizer(supported = true) {
  let handlers: RecognizerHandlers | null = null;
  const start = vi.fn((h: RecognizerHandlers) => {
    handlers = h;
  });
  const stop = vi.fn();
  const abort = vi.fn();
  const recognizer: Recognizer = { supported, start, stop, abort };
  return {
    recognizer,
    start,
    stop,
    abort,
    emitInterim: (text: string) => handlers?.onInterim?.(text),
    emitFinal: (text: string) => handlers?.onFinal(text),
    emitError: (code: string) => handlers?.onError?.(code),
  };
}

/** A controllable fake Speaker. speak() resolves immediately unless a test overrides it. */
function createFakeSpeaker(unlocked = false) {
  const box = { unlocked };
  const speak = vi.fn(() => Promise.resolve());
  const cancel = vi.fn();
  const unlock = vi.fn(() => {
    box.unlocked = true;
  });
  const speaker: Speaker = {
    supported: true,
    get unlocked() {
      return box.unlocked;
    },
    unlock,
    speak,
    cancel,
  };
  return { speaker, speak, cancel, unlock };
}

function sse(events: CouncilEvent[]): Response {
  const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`).join("");
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

/** Routes the director's fetches to the real Next route handlers (or overrides for /api/council). */
function fakeFetch(council?: (init?: RequestInit) => Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const request = new Request(new URL(url, "http://localhost"), init);
    if (url.endsWith("/api/council")) return council ? council(init) : councilRoute(request);
    if (url.endsWith("/api/mandate")) return mandateRoute(request);
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

let director: Director | null = null;
const log = vi.fn();

function start(options: Partial<DirectorOptions> = {}): Director {
  director = createDirector({
    store: useStage,
    fetchImpl: fakeFetch(async () => sse(STAGE_TRANSCRIPT)),
    log,
    ...options,
  });
  return director;
}

function seatAllAndConvene() {
  for (const spriteId of ["son", "wife", "daughter"]) emitGesture({ type: "seat", spriteId });
  expect(emitGesture({ type: "convene" })).toBe(true);
}

const appliedTypes = () => state().eventLog.map((entry) => entry.event.type);

beforeEach(() => {
  vi.useFakeTimers();
  state().resetCouncil();
  state().resetHand();
  // voiceStatus is recomputed by every start(); mute/interim are session facts that outlive it.
  state().setVoiceMuted(false);
  state().setVoiceInterim("");
});

afterEach(() => {
  director?.dispose();
  director = null;
  vi.useRealTimers();
  log.mockReset();
});

describe("beat queue", () => {
  it("plays an instant dump as paced beats", async () => {
    start();
    seatAllAndConvene();
    expect(state().phase).toBe("convening");
    expect(state().mission?.invitedSpriteIds).toEqual(["son", "wife", "daughter"]);
    expect(state().sprites.son!.mood).toBe("thinking");

    await vi.advanceTimersByTimeAsync(0);
    expect(appliedTypes()).toEqual(["opinion"]);
    expect(state().councilSource).toBe("live");

    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.opinion - 1);
    expect(appliedTypes()).toEqual(["opinion"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(appliedTypes()).toEqual(["opinion", "opinion"]);
    expect(state().sprites.wife!.mood).toBe("listening");

    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.opinion * 2);
    expect(state().phase).toBe("merge");
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.constraints);
    expect(state().phase).toBe("conflict");
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.veto - 1);
    expect(state().phase).toBe("conflict");
    await vi.advanceTimersByTimeAsync(1);
    expect(state().phase).toBe("bundle");
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.bundle + DEFAULT_BEATS.score * 2);
    expect(state().phase).toBe("scoring");
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.score);
    expect(state().phase).toBe("awaitMandate");
    expect(appliedTypes()).toEqual(STAGE_TRANSCRIPT.map((event) => event.type));
  });

  it("uses the tighter ?cut=90 preset", async () => {
    start({ cut90: true });
    seatAllAndConvene();
    const total = CUT90_BEATS.opinion * 3 + CUT90_BEATS.constraints + CUT90_BEATS.veto + CUT90_BEATS.bundle + CUT90_BEATS.score * 3;
    await vi.advanceTimersByTimeAsync(total - 1);
    expect(state().phase).toBe("scoring");
    await vi.advanceTimersByTimeAsync(1);
    expect(state().phase).toBe("awaitMandate");
    expect(total).toBeLessThan(15_000);
  });

  it("clears the queue and aborts the stream on reset", async () => {
    start();
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(DEFAULT_BEATS.opinion);
    state().toggleReasoning();
    expect(emitGesture({ type: "reset" })).toBe(true);
    expect(state().phase).toBe("lobby");
    expect(state().reasoningVisible).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state().phase).toBe("lobby");
    expect(state().eventLog).toEqual([]);
    expect(Object.values(state().sprites).every((sprite) => sprite.seat === null && sprite.mood === "idle")).toBe(true);
  });
});

describe("council transports", () => {
  it("replays the stage transcript with its latencies under ?demo", async () => {
    const council = vi.fn();
    start({ preferReplay: true, fetchImpl: fakeFetch(council) });
    seatAllAndConvene();
    expect(state().councilSource).toBe("replay");
    await vi.advanceTimersByTimeAsync(STAGE_TIMELINE[0]!.afterMs - 1);
    expect(state().phase).toBe("convening");
    await vi.advanceTimersByTimeAsync(1);
    expect(state().phase).toBe("opinions");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state().phase).toBe("awaitMandate");
    expect(council).not.toHaveBeenCalled();
  });

  it("falls back to replay when the live request fails", async () => {
    start({ fetchImpl: fakeFetch(() => Promise.reject(new Error("offline"))) });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(0);
    expect(state().councilSource).toBe("replay");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state().phase).toBe("awaitMandate");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("offline"));
  });

  it("falls back to replay when the live stream stays silent for 4 s", async () => {
    start({ fetchImpl: fakeFetch((init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(3999);
    expect(state().councilSource).toBe("live");
    await vi.advanceTimersByTimeAsync(1);
    expect(state().councilSource).toBe("replay");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state().phase).toBe("awaitMandate");
  });

  it("hands over to replay mid-stream without repeating events", async () => {
    const encoder = new TextEncoder();
    const [first, second] = STAGE_TRANSCRIPT;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of [first!, second!]) {
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`));
        }
        controller.error(new Error("socket closed"));
      },
    });
    start({ fetchImpl: fakeFetch(async () => new Response(body)) });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(appliedTypes()).toEqual(STAGE_TRANSCRIPT.map((event) => event.type));
    expect(state().phase).toBe("awaitMandate");
  });
});

describe("signing", () => {
  it("runs the real council route, synthesizes awaitMandate, and signs through /api/mandate", async () => {
    start({ fetchImpl: fakeFetch() });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(0);
    expect(emitGesture({ type: "handshakeComplete" })).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    // The cached transcript has no scores or awaiting_mandate; the stream end arms the mandate.
    expect(state().phase).toBe("awaitMandate");

    expect(emitGesture({ type: "handshakeComplete" })).toBe(true);
    expect(state().phase).toBe("signing");
    expect(emitGesture({ type: "pinchTap", target: "hearth" })).toBe(false);
    await vi.waitFor(() => expect(state().phase).toBe("receipt"));
    expect(state().receiptId).toMatch(/[0-9a-f-]{36}/);
    expect(state().mandate?.bundle.total).toBe(182);
    expect(state().sprites.son!.mood).toBe("celebrating");
  });

  it("returns to awaitMandate with an error when the signature is rejected", async () => {
    start({
      sign: async (mission, bundle) => ({
        mission,
        bundle,
        approvedAt: new Date().toISOString(),
        publicKey: {},
        signature: "AAAA",
      }),
    });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(emitGesture({ type: "handshakeComplete" })).toBe(true);
    await vi.waitFor(() => expect(state().phase).toBe("awaitMandate"));
    expect(state().error).toMatch(/rejected/);
    expect(state().receiptId).toBeNull();
  });
});

describe("intents", () => {
  it("seats sprites in free seats, swaps on drop, and sends sprites home", () => {
    start();
    emitGesture({ type: "seat", spriteId: "wife" });
    emitGesture({ type: "seat", spriteId: "son" });
    expect(state().sprites.wife!.seat).toBe(0);
    expect(state().sprites.son!.seat).toBe(1);

    emitGesture({ type: "dragStart", spriteId: "daughter" });
    expect(state().sprites.daughter!.mood).toBe("held");
    emitGesture({ type: "dragEnd", spriteId: "daughter", seat: 0 });
    expect(state().sprites.daughter).toMatchObject({ seat: 0, mood: "seated" });
    expect(state().sprites.wife).toMatchObject({ seat: null, mood: "idle" });

    emitGesture({ type: "dragEnd", spriteId: "son", seat: null });
    expect(state().sprites.son!.seat).toBeNull();
  });

  it("opens profiles on a sprite pinch in the lobby and closes them on a pinch elsewhere", () => {
    start();
    emitGesture({ type: "pinchTap", target: "sprite:son" });
    expect(state().profileOpenId).toBe("son");
    emitGesture({ type: "pinchTap", target: "tree" });
    expect(state().profileOpenId).toBeNull();
  });

  it("convenes from the hearth only once someone is seated", async () => {
    start();
    emitGesture({ type: "pinchTap", target: "hearth" });
    expect(state().phase).toBe("lobby");
    expect(state().error).toMatch(/Seat at least one/);
    emitGesture({ type: "seat", spriteId: "son" });
    emitGesture({ type: "pinchTap", target: "hearth" });
    expect(state().phase).toBe("convening");
    expect(state().mission).toMatchObject({ budget: 200, type: "shared", invitedSpriteIds: ["son"] });
  });

  it("rejects lobby gestures once the council is running and toggles reasoning anywhere", async () => {
    start();
    seatAllAndConvene();
    expect(emitGesture({ type: "seat", spriteId: "wife" })).toBe(false);
    expect(emitGesture({ type: "toggleReasoning" })).toBe(true);
    expect(state().reasoningVisible).toBe(true);
    emitGesture({ type: "toggleReasoning" });
    await vi.advanceTimersByTimeAsync(0);
    emitGesture({ type: "pinchTap", target: "sprite:son" });
    expect(state().reasoningFocusId).toBe("son");
    expect(state().reasoningVisible).toBe(true);
    expect(state().profileOpenId).toBeNull();
  });

  it("restores the previous arming policy on dispose", () => {
    start().dispose();
    director = null;
    expect(emitGesture({ type: "handshakeComplete" })).toBe(true);
  });
});

describe("voice", () => {
  it("computes the initial status from recognizer support and speaker unlock", () => {
    start({ voice: { recognizer: createFakeRecognizer(false).recognizer, speaker: createFakeSpeaker(true).speaker } });
    expect(state().voiceStatus).toBe("unsupported");
  });

  it("starts locked when supported but not yet unlocked", () => {
    start({ voice: { recognizer: createFakeRecognizer(true).recognizer, speaker: createFakeSpeaker(false).speaker } });
    expect(state().voiceStatus).toBe("locked");
  });

  it("starts idle when the speaker is already unlocked", () => {
    start({ voice: { recognizer: createFakeRecognizer(true).recognizer, speaker: createFakeSpeaker(true).speaker } });
    expect(state().voiceStatus).toBe("idle");
  });

  it("unlockVoice flips locked to idle and unlocks the speaker", () => {
    const sp = createFakeSpeaker(false);
    const d = start({ voice: { recognizer: createFakeRecognizer(true).recognizer, speaker: sp.speaker } });
    expect(state().voiceStatus).toBe("locked");
    d.unlockVoice();
    expect(sp.unlock).toHaveBeenCalledTimes(1);
    expect(state().voiceStatus).toBe("idle");
  });

  it("ignores talkStart when the recognizer is unsupported, even though the gesture is armed", () => {
    const rec = createFakeRecognizer(false);
    start({ voice: { recognizer: rec.recognizer, speaker: createFakeSpeaker(true).speaker } });
    expect(emitGesture({ type: "talkStart" })).toBe(true);
    expect(state().voiceStatus).toBe("unsupported");
    expect(rec.start).not.toHaveBeenCalled();
  });

  it("talkStart listens and mirrors interim text into the mission box; talkEnd stops it", () => {
    const rec = createFakeRecognizer(true);
    start({ voice: { recognizer: rec.recognizer, speaker: createFakeSpeaker(true).speaker } });
    emitGesture({ type: "talkStart" });
    expect(state().voiceStatus).toBe("listening");
    expect(rec.start).toHaveBeenCalledTimes(1);

    rec.emitInterim("find orn");
    expect(state().missionText).toBe("find orn");
    expect(state().voiceInterim).toBe("find orn");

    emitGesture({ type: "talkEnd" });
    expect(rec.stop).toHaveBeenCalledTimes(1);
    expect(state().voiceStatus).toBe("idle");
  });

  it("talkEnd falls back to locked when the speaker still isn't unlocked", () => {
    const rec = createFakeRecognizer(true);
    start({ voice: { recognizer: rec.recognizer, speaker: createFakeSpeaker(false).speaker } });
    expect(state().voiceStatus).toBe("locked");
    emitGesture({ type: "talkStart" });
    emitGesture({ type: "talkEnd" });
    expect(state().voiceStatus).toBe("locked");
  });

  it("a second talkStart while already listening is ignored", () => {
    const rec = createFakeRecognizer(true);
    start({ voice: { recognizer: rec.recognizer, speaker: createFakeSpeaker(true).speaker } });
    emitGesture({ type: "talkStart" });
    emitGesture({ type: "talkStart" });
    expect(rec.start).toHaveBeenCalledTimes(1);
  });

  it("talkEnd is a no-op when not listening", () => {
    const rec = createFakeRecognizer(true);
    start({ voice: { recognizer: rec.recognizer, speaker: createFakeSpeaker(true).speaker } });
    expect(emitGesture({ type: "talkEnd" })).toBe(true); // armed in every phase
    expect(rec.stop).not.toHaveBeenCalled();
  });

  it("convenes on a final transcript when a sprite is seated", () => {
    const rec = createFakeRecognizer(true);
    start({ voice: { recognizer: rec.recognizer, speaker: createFakeSpeaker(true).speaker } });
    emitGesture({ type: "seat", spriteId: "son" });
    emitGesture({ type: "talkStart" });
    rec.emitFinal("Find ornaments under $200");
    expect(state().missionText).toBe("Find ornaments under $200");
    expect(state().phase).toBe("convening");
    expect(state().error).toBeNull();
  });

  it("errors instead of convening when the final transcript arrives with no one seated", () => {
    const rec = createFakeRecognizer(true);
    start({ voice: { recognizer: rec.recognizer, speaker: createFakeSpeaker(true).speaker } });
    emitGesture({ type: "talkStart" });
    rec.emitFinal("Find ornaments");
    expect(state().phase).toBe("lobby");
    expect(state().error).toMatch(/Seat at least one/);
  });

  it("gives a friendly error on an empty transcript", () => {
    const rec = createFakeRecognizer(true);
    start({ voice: { recognizer: rec.recognizer, speaker: createFakeSpeaker(true).speaker } });
    emitGesture({ type: "seat", spriteId: "son" });
    emitGesture({ type: "talkStart" });
    rec.emitFinal("   ");
    expect(state().error).toMatch(/didn't catch that/);
    expect(state().phase).toBe("lobby");
  });

  it("keeps a fatal error's message when the empty final transcript follows it", () => {
    const rec = createFakeRecognizer(true);
    start({ voice: { recognizer: rec.recognizer, speaker: createFakeSpeaker(true).speaker } });
    emitGesture({ type: "talkStart" });
    rec.emitError("not-allowed");
    emitGesture({ type: "talkEnd" });
    rec.emitFinal("");
    expect(state().error).toMatch(/microphone/i);
  });

  it.each([
    ["not-allowed", /microphone/i],
    ["service-not-allowed", /microphone/i],
    ["network", /wi-fi/i],
    ["language-not-supported", /language/i],
  ])("surfaces a friendly error for the %s recognizer error", (code, expected) => {
    const rec = createFakeRecognizer(true);
    start({ voice: { recognizer: rec.recognizer, speaker: createFakeSpeaker(true).speaker } });
    emitGesture({ type: "talkStart" });
    rec.emitError(code);
    expect(state().error).toMatch(expected);
  });

  it("ignores no-speech and aborted recognizer errors", () => {
    const rec = createFakeRecognizer(true);
    start({ voice: { recognizer: rec.recognizer, speaker: createFakeSpeaker(true).speaker } });
    emitGesture({ type: "talkStart" });
    rec.emitError("no-speech");
    rec.emitError("aborted");
    expect(state().error).toBeNull();
  });

  it("drops a final transcript that arrives after a reset", () => {
    const rec = createFakeRecognizer(true);
    start({ voice: { recognizer: rec.recognizer, speaker: createFakeSpeaker(true).speaker } });
    emitGesture({ type: "seat", spriteId: "son" });
    emitGesture({ type: "talkStart" });
    expect(emitGesture({ type: "reset" })).toBe(true);
    rec.emitFinal("Find ornaments under $200");
    expect(state().missionText).not.toBe("Find ornaments under $200");
    expect(state().phase).toBe("lobby");
  });

  it("toggleVoiceMute cancels speech and suppresses later opinion beats", async () => {
    const sp = createFakeSpeaker(true);
    start({ fetchImpl: fakeFetch(async () => sse(STAGE_TRANSCRIPT)), voice: { recognizer: createFakeRecognizer(true).recognizer, speaker: sp.speaker } });
    expect(emitGesture({ type: "toggleVoiceMute" })).toBe(true);
    expect(state().voiceMuted).toBe(true);
    expect(sp.cancel).toHaveBeenCalledTimes(1);

    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sp.speak).not.toHaveBeenCalled();

    expect(emitGesture({ type: "toggleVoiceMute" })).toBe(true);
    expect(state().voiceMuted).toBe(false);
  });

  it("speaks opinion beats through the speaker in the sprite's voice", async () => {
    const sp = createFakeSpeaker(true);
    start({ fetchImpl: fakeFetch(async () => sse(STAGE_TRANSCRIPT)), voice: { recognizer: createFakeRecognizer(true).recognizer, speaker: sp.speaker } });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(0);
    expect(sp.speak).toHaveBeenCalledWith("wife", expect.stringContaining("Warm and elegant"));
  });

  it("never speaks when unsupported, locked, or in the 90-second cut", async () => {
    const unsupported = createFakeSpeaker(true);
    Object.defineProperty(unsupported.speaker, "supported", { value: false });
    const d1 = start({ fetchImpl: fakeFetch(async () => sse(STAGE_TRANSCRIPT)), voice: { recognizer: createFakeRecognizer(true).recognizer, speaker: unsupported.speaker } });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(unsupported.speak).not.toHaveBeenCalled();
    d1.dispose();
    director = null;
    state().resetCouncil();

    const locked = createFakeSpeaker(false);
    const d2 = start({ fetchImpl: fakeFetch(async () => sse(STAGE_TRANSCRIPT)), voice: { recognizer: createFakeRecognizer(true).recognizer, speaker: locked.speaker } });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(locked.speak).not.toHaveBeenCalled();
    d2.dispose();
    director = null;
    state().resetCouncil();

    const cut = createFakeSpeaker(true);
    start({ cut90: true, fetchImpl: fakeFetch(async () => sse(STAGE_TRANSCRIPT)), voice: { recognizer: createFakeRecognizer(true).recognizer, speaker: cut.speaker } });
    seatAllAndConvene();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cut.speak).not.toHaveBeenCalled();
  });

  it("reset() aborts the recognizer and cancels speech", () => {
    const rec = createFakeRecognizer(true);
    const sp = createFakeSpeaker(true);
    start({ voice: { recognizer: rec.recognizer, speaker: sp.speaker } });
    expect(emitGesture({ type: "reset" })).toBe(true);
    expect(rec.abort).toHaveBeenCalledTimes(1);
    expect(sp.cancel).toHaveBeenCalledTimes(1);
  });

  it("dispose() aborts the recognizer and cancels speech", () => {
    const rec = createFakeRecognizer(true);
    const sp = createFakeSpeaker(true);
    start({ voice: { recognizer: rec.recognizer, speaker: sp.speaker } }).dispose();
    director = null;
    expect(rec.abort).toHaveBeenCalledTimes(1);
    expect(sp.cancel).toHaveBeenCalledTimes(1);
  });

  it("reset clears the interim caption and returns listening to idle, but keeps mute/unlock facts", () => {
    const rec = createFakeRecognizer(true);
    const sp = createFakeSpeaker(true);
    start({ voice: { recognizer: rec.recognizer, speaker: sp.speaker } });
    emitGesture({ type: "toggleVoiceMute" });
    emitGesture({ type: "talkStart" });
    rec.emitInterim("find orn");
    expect(state().voiceInterim).toBe("find orn");

    expect(emitGesture({ type: "reset" })).toBe(true);
    expect(state().voiceInterim).toBe("");
    expect(state().voiceStatus).toBe("idle");
    expect(state().voiceMuted).toBe(true); // a session fact, not cleared by reset
  });
});
