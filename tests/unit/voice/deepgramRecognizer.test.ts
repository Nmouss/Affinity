import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildListenUrl, createDeepgramRecognizer, DEEPGRAM_LISTEN_PARAMS, type RecorderLike, type SocketLike, type StreamLike } from "@/lib/voice/deepgramRecognizer";

class FakeSocket implements SocketLike {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  sent: Array<string | Blob | ArrayBuffer> = [];
  closed: Array<{ code?: number; reason?: string }> = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor(
    public url: string,
    public protocols?: string | string[],
  ) {
    FakeSocket.instances.push(this);
  }
  send(data: string | Blob | ArrayBuffer) {
    this.sent.push(data);
  }
  close(code?: number, reason?: string) {
    this.readyState = 3;
    this.closed.push({ code, reason });
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  message(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
  drop(code = 1011) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

class FakeRecorder implements RecorderLike {
  static instances: FakeRecorder[] = [];
  started: number[] = [];
  stopped = 0;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  constructor(
    public stream: StreamLike,
    public options?: { mimeType?: string },
  ) {
    FakeRecorder.instances.push(this);
  }
  start(timeslice?: number) {
    this.started.push(timeslice ?? 0);
  }
  stop() {
    this.stopped += 1;
  }
  chunk(size = 10) {
    this.ondataavailable?.({ data: { size } as Blob });
  }
}

function fakeStream() {
  const track = { stop: vi.fn() };
  return { stream: { getTracks: () => [track] } as StreamLike, track };
}

function results(transcript: string, is_final: boolean, speech_final = false) {
  return { type: "Results", is_final, speech_final, channel: { alternatives: [{ transcript }] } };
}

function setup(overrides: Partial<Parameters<typeof createDeepgramRecognizer>[0]> = {}) {
  const { stream, track } = fakeStream();
  const recognizer = createDeepgramRecognizer({
    getToken: async () => "jwt-123",
    getUserMedia: async () => stream,
    WebSocketCtor: FakeSocket as never,
    MediaRecorderCtor: FakeRecorder as never,
    isTypeSupported: () => true,
    ...overrides,
  });
  const handlers = { onFinal: vi.fn(), onInterim: vi.fn(), onSilence: vi.fn(), onSpeechStart: vi.fn(), onError: vi.fn() };
  return { recognizer, handlers, track };
}

/** Lets start()'s async chain (getUserMedia → token → socket) settle. */
async function settle() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

beforeEach(() => {
  FakeSocket.instances = [];
  FakeRecorder.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildListenUrl", () => {
  it("encodes the endpointing params on the listen endpoint", () => {
    const url = buildListenUrl();
    expect(url.startsWith("wss://api.deepgram.com/v1/listen?")).toBe(true);
    for (const [key, value] of Object.entries(DEEPGRAM_LISTEN_PARAMS)) expect(url).toContain(`${key}=${value}`);
    expect(url).not.toContain("encoding=");
  });
});

describe("createDeepgramRecognizer", () => {
  it("is unsupported when webm/opus cannot be recorded", () => {
    const { recognizer } = setup({ isTypeSupported: () => false });
    expect(recognizer.supported).toBe(false);
  });

  it("opens the socket with the bearer subprotocol and streams recorder chunks only while open", async () => {
    const { recognizer, handlers } = setup();
    recognizer.start(handlers);
    await settle();
    const socket = FakeSocket.instances[0]!;
    expect(socket.protocols).toEqual(["bearer", "jwt-123"]);
    expect(socket.url).toBe(buildListenUrl());
    expect(FakeRecorder.instances).toHaveLength(0); // recording waits for open
    socket.open();
    const recorder = FakeRecorder.instances[0]!;
    expect(recorder.options?.mimeType).toBe("audio/webm;codecs=opus");
    expect(recorder.started).toEqual([250]);
    recorder.chunk();
    expect(socket.sent).toHaveLength(1);
    socket.readyState = 0;
    recorder.chunk();
    expect(socket.sent).toHaveLength(1);
  });

  it("is a no-op to start twice", async () => {
    const { recognizer, handlers } = setup();
    recognizer.start(handlers);
    recognizer.start(handlers);
    await settle();
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("concatenates finals, reports interims, and announces speech start once", async () => {
    const { recognizer, handlers } = setup();
    recognizer.start(handlers);
    await settle();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.message(results("i went", false));
    socket.message(results("i went hiking", true));
    socket.message(results("with", false));
    expect(handlers.onInterim.mock.calls.map((call) => call[0])).toEqual(["i went", "i went hiking", "i went hiking with"]);
    expect(handlers.onSpeechStart).toHaveBeenCalledTimes(1);
  });

  it("signals silence on speech_final and on UtteranceEnd", async () => {
    const { recognizer, handlers } = setup();
    recognizer.start(handlers);
    await settle();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.message(results("hello", true, true));
    socket.message({ type: "UtteranceEnd", channel: [0, 1], last_word_end: 2.1 });
    expect(handlers.onSilence).toHaveBeenCalledTimes(2);
    socket.message({ type: "SpeechStarted" });
    expect(handlers.onSpeechStart).toHaveBeenCalledTimes(1); // already announced by the first transcript
  });

  it("stop() sends CloseStream and delivers the final once when the last is_final arrives", async () => {
    const { recognizer, handlers, track } = setup();
    recognizer.start(handlers);
    await settle();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.message(results("i went hiking", true));
    socket.message(results("with friends", false));
    recognizer.stop();
    expect(FakeRecorder.instances[0]!.stopped).toBe(1);
    expect(socket.sent.at(-1)).toBe(JSON.stringify({ type: "CloseStream" }));
    expect(handlers.onFinal).not.toHaveBeenCalled();
    socket.message(results("with friends", true));
    expect(handlers.onFinal).toHaveBeenCalledTimes(1);
    expect(handlers.onFinal).toHaveBeenCalledWith("i went hiking with friends");
    expect(track.stop).toHaveBeenCalled();
    expect(socket.closed).toHaveLength(1);
    // Nothing more may arrive.
    socket.message(results("late", true));
    vi.advanceTimersByTime(5000);
    expect(handlers.onFinal).toHaveBeenCalledTimes(1);
  });

  it("stop() falls back to the safety timer when Deepgram never confirms", async () => {
    const { recognizer, handlers } = setup({ safetyMs: 1500 });
    recognizer.start(handlers);
    await settle();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.message(results("pottery", false));
    recognizer.stop();
    vi.advanceTimersByTime(1499);
    expect(handlers.onFinal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(handlers.onFinal).toHaveBeenCalledWith("pottery");
  });

  it("abort() never delivers a final and stops the tracks", async () => {
    const { recognizer, handlers, track } = setup();
    recognizer.start(handlers);
    await settle();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.message(results("secret", true));
    recognizer.abort();
    socket.message(results("more", true));
    vi.advanceTimersByTime(5000);
    expect(handlers.onFinal).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    expect(socket.closed).toHaveLength(1);
  });

  it("stops tracks from a getUserMedia that resolves after abort()", async () => {
    const { stream, track } = fakeStream();
    let resolveMedia: (s: StreamLike) => void = () => undefined;
    const { recognizer, handlers } = setup({ getUserMedia: () => new Promise<StreamLike>((resolve) => (resolveMedia = resolve)) });
    recognizer.start(handlers);
    recognizer.abort();
    resolveMedia(stream);
    await settle();
    expect(track.stop).toHaveBeenCalled();
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it("reports not-allowed when the microphone is denied", async () => {
    const { recognizer, handlers } = setup({ getUserMedia: async () => Promise.reject(new Error("denied")) });
    recognizer.start(handlers);
    await settle();
    expect(handlers.onError).toHaveBeenCalledWith("not-allowed");
    expect(FakeSocket.instances).toHaveLength(0);
    // The recognizer is free again.
    recognizer.start(handlers);
    await settle();
    expect(handlers.onError).toHaveBeenCalledTimes(2);
  });

  it("reports unsupported when no token can be minted", async () => {
    const { recognizer, handlers, track } = setup({ getToken: async () => null });
    recognizer.start(handlers);
    await settle();
    expect(handlers.onError).toHaveBeenCalledWith("unsupported");
    expect(track.stop).toHaveBeenCalled();
  });

  it("treats a premature close as a network error and hands back what was heard, once", async () => {
    const { recognizer, handlers } = setup();
    recognizer.start(handlers);
    await settle();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.message(results("gardening", true));
    socket.drop();
    expect(handlers.onError).toHaveBeenCalledWith("network");
    expect(handlers.onFinal).toHaveBeenCalledTimes(1);
    expect(handlers.onFinal).toHaveBeenCalledWith("gardening");
    recognizer.stop();
    vi.advanceTimersByTime(5000);
    expect(handlers.onFinal).toHaveBeenCalledTimes(1);
  });
});
