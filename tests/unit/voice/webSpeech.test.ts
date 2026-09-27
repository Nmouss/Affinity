import { describe, expect, it, vi } from "vitest";
import {
  createWebSpeechRecognizer,
  createWebSpeechSpeaker,
  installOnDeviceSpeech,
  pickInterviewerVoice,
  splitSentences,
  type RecognitionHost,
  type SpeechSynthesisLike,
  type UtteranceLike,
  type VoiceLike,
} from "@/lib/voice/webSpeech";

function result(transcript: string, isFinal: boolean) {
  const alt = { transcript, confidence: 1 };
  return { isFinal, length: 1, item: (i: number) => (i === 0 ? alt : undefined), 0: alt } as unknown as SpeechRecognitionResult;
}

function resultList(results: SpeechRecognitionResult[]): SpeechRecognitionResultList {
  return { length: results.length, item: (i: number) => results[i], ...Object.fromEntries(results.map((r, i) => [i, r])) } as unknown as SpeechRecognitionResultList;
}

class FakeRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 1;
  processLocally = false;
  started = 0;
  stopped = 0;
  aborted = 0;
  onresult: ((event: unknown) => void) | null = null;
  onend: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
  }
  abort() {
    this.aborted += 1;
  }
  emitResult(resultIndex: number, results: SpeechRecognitionResult[]) {
    this.onresult?.({ resultIndex, results: resultList(results) });
  }
  emitEnd() {
    this.onend?.({});
  }
  emitError(error: string) {
    this.onerror?.({ error });
  }
}

function fakeConstructor(options: { available?: () => Promise<"available" | "unavailable">; install?: () => Promise<boolean> } = {}) {
  let last: FakeRecognition | null = null;
  const Ctor = vi.fn(() => {
    last = new FakeRecognition();
    return last;
  }) as unknown as { new (): FakeRecognition; available?: unknown; install?: unknown };
  if (options.available) Ctor.available = options.available;
  if (options.install) Ctor.install = options.install;
  return { Ctor, current: () => last as unknown as FakeRecognition };
}

const hostWith = (Ctor: unknown): RecognitionHost => ({ SpeechRecognition: Ctor as never });

describe("createWebSpeechRecognizer", () => {
  it("is unsupported without a constructor and without a window", () => {
    expect(createWebSpeechRecognizer({}, { window: {} }).supported).toBe(false);
    expect(createWebSpeechRecognizer().supported).toBe(false);
  });

  it("configures the engine and starts once", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createWebSpeechRecognizer({ lang: "en-GB" }, { window: hostWith(Ctor) });
    recognizer.start({ onFinal: () => undefined });
    recognizer.start({ onFinal: () => undefined });
    expect(current().continuous).toBe(true);
    expect(current().interimResults).toBe(true);
    expect(current().lang).toBe("en-GB");
    expect(current().started).toBe(1);
  });

  it("reports interims, speech start once, and silence after a final result with no tail", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createWebSpeechRecognizer({}, { window: hostWith(Ctor) });
    const interims: string[] = [];
    const onSilence = vi.fn();
    const onSpeechStart = vi.fn();
    recognizer.start({ onFinal: () => undefined, onInterim: (t) => interims.push(t), onSilence, onSpeechStart });
    current().emitResult(0, [result("i went", false)]);
    current().emitResult(0, [result("i went hiking", true)]);
    expect(interims).toEqual(["i went", "i went hiking"]);
    expect(onSpeechStart).toHaveBeenCalledTimes(1);
    expect(onSilence).toHaveBeenCalledTimes(1);
  });

  it("stop() delivers the combined transcript exactly once when end fires", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createWebSpeechRecognizer({}, { window: hostWith(Ctor) });
    const finals: string[] = [];
    recognizer.start({ onFinal: (t) => finals.push(t) });
    const first = result("find christmas decorations", true);
    current().emitResult(0, [first]);
    current().emitResult(1, [first, result("under two hundred", false)]);
    recognizer.stop();
    current().emitEnd();
    current().emitEnd();
    expect(finals).toEqual(["find christmas decorations under two hundred"]);
  });

  it("abort() discards the transcript", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createWebSpeechRecognizer({}, { window: hostWith(Ctor) });
    const onFinal = vi.fn();
    recognizer.start({ onFinal });
    current().emitResult(0, [result("secret", true)]);
    recognizer.abort();
    current().emitEnd();
    expect(current().aborted).toBe(1);
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("restarts transparently on an unexpected end, up to the cap", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createWebSpeechRecognizer({}, { window: hostWith(Ctor) });
    const finals: string[] = [];
    recognizer.start({ onFinal: (t) => finals.push(t) });
    current().emitResult(0, [result("hello", true)]);
    for (let i = 0; i < 3; i += 1) current().emitEnd();
    expect(Ctor).toHaveBeenCalledTimes(4);
    current().emitEnd();
    expect(finals).toEqual(["hello"]);
  });

  it("treats not-allowed as fatal and still delivers what was heard", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createWebSpeechRecognizer({}, { window: hostWith(Ctor) });
    const finals: string[] = [];
    const errors: string[] = [];
    recognizer.start({ onFinal: (t) => finals.push(t), onError: (c) => errors.push(c) });
    current().emitResult(0, [result("hello", true)]);
    current().emitError("not-allowed");
    expect(current().stopped).toBe(1);
    current().emitEnd();
    expect(errors).toEqual(["not-allowed"]);
    expect(finals).toEqual(["hello"]);
  });

  it("uses on-device recognition once available() says so", async () => {
    const { Ctor, current } = fakeConstructor({ available: async () => "available" });
    const recognizer = createWebSpeechRecognizer({}, { window: hostWith(Ctor) });
    await Promise.resolve();
    await Promise.resolve();
    recognizer.start({ onFinal: () => undefined });
    expect(current().processLocally).toBe(true);
  });
});

describe("installOnDeviceSpeech", () => {
  it("returns false without a constructor or install(), true when install succeeds", async () => {
    await expect(installOnDeviceSpeech("en-US", { window: {} })).resolves.toBe(false);
    const plain = fakeConstructor();
    await expect(installOnDeviceSpeech("en-US", { window: hostWith(plain.Ctor) })).resolves.toBe(false);
    const install = vi.fn(async () => true);
    const withInstall = fakeConstructor({ install });
    await expect(installOnDeviceSpeech("en-US", { window: hostWith(withInstall.Ctor) })).resolves.toBe(true);
  });
});

// --- speaker

class FakeUtterance implements UtteranceLike {
  voice: VoiceLike | null = null;
  pitch = 1;
  rate = 1;
  volume = 1;
  onend: ((event?: unknown) => void) | null = null;
  onerror: ((event?: { error?: string }) => void) | null = null;
  constructor(public text: string) {}
}

function createFakeSynth(voices: VoiceLike[] = []) {
  const queue: FakeUtterance[] = [];
  const synth: SpeechSynthesisLike = {
    getVoices: () => voices,
    speak: (utterance) => {
      queue.push(utterance as FakeUtterance);
    },
    cancel: vi.fn(),
    resume: vi.fn(),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  return { synth, queue };
}

const voice = (name: string, lang = "en-US", localService = true): VoiceLike => ({ name, lang, localService, default: false });

describe("createWebSpeechSpeaker", () => {
  it("is unsupported without a synth and resolves speak() immediately", async () => {
    const speaker = createWebSpeechSpeaker();
    expect(speaker.supported).toBe(false);
    await expect(speaker.speak("hello")).resolves.toBeUndefined();
  });

  it("speaks sentence by sentence with the interviewer voice and resolves after the last one", async () => {
    const { synth, queue } = createFakeSynth([voice("Samantha")]);
    const speaker = createWebSpeechSpeaker({ synth, createUtterance: (text) => new FakeUtterance(text) });
    let resolved = false;
    const done = speaker.speak("Hello there. How are you?").then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(queue.map((u) => u.text)).toEqual(["Hello there."]);
    expect(queue[0]!.voice?.name).toBe("Samantha");
    expect(queue[0]!.rate).toBe(1);
    queue[0]!.onend?.();
    await Promise.resolve();
    expect(queue.map((u) => u.text)).toEqual(["Hello there.", "How are you?"]);
    expect(resolved).toBe(false);
    queue[1]!.onend?.();
    await done;
    expect(resolved).toBe(true);
  });

  it("unlock() speaks a silent utterance; cancel() cancels and resolves pending", async () => {
    const { synth, queue } = createFakeSynth();
    const speaker = createWebSpeechSpeaker({ synth, createUtterance: (text) => new FakeUtterance(text) });
    speaker.unlock();
    expect(queue[0]!.volume).toBe(0);
    const done = speaker.speak("A line.");
    await Promise.resolve();
    speaker.cancel();
    await done;
    expect(synth.cancel).toHaveBeenCalled();
  });

  it("flips supported off when the engine reports not-allowed", async () => {
    const { synth, queue } = createFakeSynth();
    const speaker = createWebSpeechSpeaker({ synth, createUtterance: (text) => new FakeUtterance(text) });
    const done = speaker.speak("Blocked.");
    await Promise.resolve();
    queue[0]!.onerror?.({ error: "not-allowed" });
    await done;
    expect(speaker.supported).toBe(false);
  });
});

describe("helpers", () => {
  it("splits sentences and prefers a local English voice", () => {
    expect(splitSentences("One. Two! Three?")).toEqual(["One.", "Two!", "Three?"]);
    expect(pickInterviewerVoice([voice("Fr", "fr-FR"), voice("Cloud", "en-GB", false), voice("Local", "en-US", true)])?.name).toBe("Local");
    expect(pickInterviewerVoice([voice("Fr", "fr-FR")])).toBeNull();
  });
});
