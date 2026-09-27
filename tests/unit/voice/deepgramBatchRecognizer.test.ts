import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeepgramBatchRecognizer, pickRecordingMime } from "@/lib/voice/deepgramBatchRecognizer";
import type { RecorderCtorLike, RecorderLike, StreamLike } from "@/lib/voice/deepgramRecognizer";

function fakeStream() {
  const stops: number[] = [];
  const stream: StreamLike = { getTracks: () => [{ stop: () => stops.push(1) }] };
  return { stream, stops };
}

function fakeRecorder() {
  const instances: RecorderLike[] = [];
  const Ctor = class implements RecorderLike {
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    started: number[] = [];
    stopped = 0;
    constructor(public stream: StreamLike, public options?: { mimeType?: string }) {
      instances.push(this);
    }
    start(timeslice?: number) {
      this.started.push(timeslice ?? 0);
    }
    stop() {
      this.stopped += 1;
      // A real recorder flushes its last chunk on stop.
      this.ondataavailable?.({ data: new Blob(["tail"], { type: "audio/webm" }) });
    }
    static isTypeSupported(mime: string) {
      return mime === "audio/webm;codecs=opus";
    }
  } as unknown as RecorderCtorLike & { new (...args: never[]): RecorderLike };
  return { Ctor, instances: instances as Array<RecorderLike & { started: number[]; stopped: number }> };
}

/** An analyser whose loudness we script per poll. */
function fakeAudio(levels: number[]) {
  let call = 0;
  const AudioContextCtor = class {
    closed = 0;
    createMediaStreamSource() {
      return { connect: () => undefined };
    }
    createAnalyser() {
      return {
        fftSize: 1024,
        getByteTimeDomainData(target: Uint8Array) {
          const level = levels[Math.min(call, levels.length - 1)] ?? 0;
          call += 1;
          target.fill(128 + Math.round(level * 128));
        },
      };
    }
    close() {
      this.closed += 1;
    }
  };
  return { AudioContextCtor };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("pickRecordingMime", () => {
  it("prefers webm/opus, then webm, then mp4", () => {
    expect(pickRecordingMime((m) => m === "audio/mp4")).toBe("audio/mp4");
    expect(pickRecordingMime((m) => m.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickRecordingMime(() => false)).toBeNull();
    expect(pickRecordingMime(undefined)).toBeNull();
  });
});

describe("createDeepgramBatchRecognizer", () => {
  it("records, hears silence after speech, and transcribes the assembled blob on stop", async () => {
    const { stream, stops } = fakeStream();
    const { Ctor, instances } = fakeRecorder();
    const { AudioContextCtor } = fakeAudio([0, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const transcribe = vi.fn(async (blob: Blob) => (blob.size > 0 ? "went hiking" : ""));
    const recognizer = createDeepgramBatchRecognizer({
      getUserMedia: async () => stream,
      MediaRecorderCtor: Ctor,
      AudioContextCtor: AudioContextCtor as never,
      transcribe,
      silenceMs: 500,
      pollMs: 100,
    });
    expect(recognizer.supported).toBe(true);
    const onFinal = vi.fn();
    const onSilence = vi.fn();
    const onSpeechStart = vi.fn();
    recognizer.start({ onFinal, onSilence, onSpeechStart });
    await vi.advanceTimersByTimeAsync(0);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.started).toEqual([500]);
    instances[0]!.ondataavailable?.({ data: new Blob(["chunk"], { type: "audio/webm" }) });
    await vi.advanceTimersByTimeAsync(300);
    expect(onSpeechStart).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(700);
    expect(onSilence).toHaveBeenCalledTimes(1);
    recognizer.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcribe.mock.calls[0]![0].size).toBeGreaterThan(0);
    expect(onFinal).toHaveBeenCalledWith("went hiking");
    expect(stops.length).toBeGreaterThan(0);
  });

  it("reports not-allowed when the mic is refused and network when transcription fails", async () => {
    const { Ctor } = fakeRecorder();
    const denied = createDeepgramBatchRecognizer({ getUserMedia: () => Promise.reject(new Error("denied")), MediaRecorderCtor: Ctor, transcribe: async () => "x" });
    const onError = vi.fn();
    denied.start({ onFinal: vi.fn(), onError });
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith("not-allowed");

    const { stream } = fakeStream();
    const failing = createDeepgramBatchRecognizer({ getUserMedia: async () => stream, MediaRecorderCtor: Ctor, transcribe: async () => null });
    const onFinal = vi.fn();
    const onNetError = vi.fn();
    failing.start({ onFinal, onError: onNetError });
    await vi.advanceTimersByTimeAsync(0);
    failing.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(onNetError).toHaveBeenCalledWith("network");
    expect(onFinal).toHaveBeenCalledWith("");
  });

  it("abort never delivers a transcript and a late mic grant is released", async () => {
    let release: (stream: StreamLike) => void = () => undefined;
    const { stream, stops } = fakeStream();
    const { Ctor } = fakeRecorder();
    const transcribe = vi.fn(async () => "late");
    const recognizer = createDeepgramBatchRecognizer({
      getUserMedia: () => new Promise((resolve) => (release = resolve)),
      MediaRecorderCtor: Ctor,
      transcribe,
    });
    const onFinal = vi.fn();
    recognizer.start({ onFinal });
    recognizer.abort();
    release(stream);
    await vi.advanceTimersByTimeAsync(0);
    expect(stops.length).toBeGreaterThan(0);
    expect(onFinal).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("is unsupported without a recordable type", () => {
    const recognizer = createDeepgramBatchRecognizer({ getUserMedia: async () => fakeStream().stream, MediaRecorderCtor: fakeRecorder().Ctor, isTypeSupported: () => false });
    expect(recognizer.supported).toBe(false);
  });
});
