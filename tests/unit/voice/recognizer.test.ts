import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRecognizer, installOnDeviceSpeech, type RecognitionHost } from "@/lib/voice/recognizer";

/** Minimal fake alternative/result/result-list, shaped like the real Web Speech API types. */
function alternative(transcript: string) {
  return { transcript, confidence: 1 };
}

function result(transcript: string, isFinal: boolean) {
  const alt = alternative(transcript);
  return { isFinal, length: 1, item: (i: number) => (i === 0 ? alt : undefined), 0: alt } as unknown as SpeechRecognitionResult;
}

function resultList(results: SpeechRecognitionResult[]): SpeechRecognitionResultList {
  return {
    length: results.length,
    item: (i: number) => results[i],
    ...Object.fromEntries(results.map((r, i) => [i, r])),
  } as unknown as SpeechRecognitionResultList;
}

/** A fake `webkitSpeechRecognition` instance: records config, and lets the test fire its handlers. */
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

interface FakeCtorOptions {
  available?: (options: { langs: string[] }) => Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  install?: (options: { langs: string[] }) => Promise<boolean>;
}

/** Builds a fake constructor and hands back the most recently constructed instance for the test to drive. */
function fakeConstructor(options: FakeCtorOptions = {}) {
  let last: FakeRecognition | null = null;
  const Ctor = vi.fn(() => {
    last = new FakeRecognition();
    return last;
  }) as unknown as {
    new (): FakeRecognition;
    available?: FakeCtorOptions["available"];
    install?: FakeCtorOptions["install"];
  };
  if (options.available) Ctor.available = options.available;
  if (options.install) Ctor.install = options.install;
  return { Ctor, current: () => last as unknown as FakeRecognition };
}

function hostWith(Ctor: unknown): RecognitionHost {
  return { SpeechRecognition: Ctor as never };
}

describe("createRecognizer", () => {
  it("is unsupported when there's no constructor on the host and no window", () => {
    const recognizer = createRecognizer({}, { window: {} });
    expect(recognizer.supported).toBe(false);
  });

  it("is unsupported with no window at all (SSR/node default)", () => {
    const recognizer = createRecognizer();
    expect(recognizer.supported).toBe(false);
  });

  it("configures continuous/interim/lang/maxAlternatives and starts on start()", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createRecognizer({ lang: "en-GB" }, { window: hostWith(Ctor) });
    recognizer.start({ onFinal: () => undefined });
    const instance = current();
    expect(instance.continuous).toBe(true);
    expect(instance.interimResults).toBe(true);
    expect(instance.lang).toBe("en-GB");
    expect(instance.maxAlternatives).toBe(1);
    expect(instance.started).toBe(1);
  });

  it("is a no-op to call start() again while already listening", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createRecognizer({}, { window: hostWith(Ctor) });
    recognizer.start({ onFinal: () => undefined });
    recognizer.start({ onFinal: () => undefined });
    expect(current().started).toBe(1);
  });

  it("accumulates interim text across results and reports it through onInterim", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createRecognizer({}, { window: hostWith(Ctor) });
    const interims: string[] = [];
    recognizer.start({ onFinal: () => undefined, onInterim: (text) => interims.push(text) });

    current().emitResult(0, [result("find christmas", false)]);
    current().emitResult(0, [result("find christmas decorations", false)]);

    expect(interims).toEqual(["find christmas", "find christmas decorations"]);
  });

  it("stop() delivers the full transcript through onFinal exactly once, when end fires", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createRecognizer({}, { window: hostWith(Ctor) });
    const finals: string[] = [];
    recognizer.start({ onFinal: (text) => finals.push(text) });

    current().emitResult(0, [result("find christmas decorations", true)]);
    recognizer.stop();
    current().emitEnd();

    expect(current().stopped).toBe(1);
    expect(finals).toEqual(["find christmas decorations"]);

    // A second end firing (or anything else) must not deliver onFinal again.
    current().emitEnd();
    expect(finals.length).toBe(1);
  });

  it("combines multiple final results plus a trailing interim into one onFinal transcript", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createRecognizer({}, { window: hostWith(Ctor) });
    const finals: string[] = [];
    recognizer.start({ onFinal: (text) => finals.push(text) });

    const finalResult = result("find christmas decorations", true);
    current().emitResult(0, [finalResult]);
    // A later event addresses a growing results list (as the real API does); resultIndex points at
    // just the new entry, so the already-final first result isn't reprocessed.
    current().emitResult(1, [finalResult, result("under two hundred", false)]);
    recognizer.stop();
    current().emitEnd();

    expect(finals).toEqual(["find christmas decorations under two hundred"]);
  });

  it("abort() discards the transcript: onFinal is never called", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createRecognizer({}, { window: hostWith(Ctor) });
    const onFinal = vi.fn();
    recognizer.start({ onFinal });

    current().emitResult(0, [result("find christmas decorations", true)]);
    recognizer.abort();
    current().emitEnd();

    expect(current().aborted).toBe(1);
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("restarts transparently on an unexpected end, keeping the accumulated transcript", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createRecognizer({}, { window: hostWith(Ctor) });
    const finals: string[] = [];
    recognizer.start({ onFinal: (text) => finals.push(text) });

    current().emitResult(0, [result("find christmas", true)]);
    // Chrome ends the session on its own (silence) while the user is still holding talk.
    current().emitEnd();
    expect(Ctor).toHaveBeenCalledTimes(2); // a fresh instance was constructed and started again

    current().emitResult(0, [result("decorations", true)]);
    recognizer.stop();
    current().emitEnd();

    expect(finals).toEqual(["find christmas decorations"]);
  });

  it("caps auto-restarts and delivers whatever was heard once the cap is hit", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createRecognizer({}, { window: hostWith(Ctor) });
    const finals: string[] = [];
    recognizer.start({ onFinal: (text) => finals.push(text) });

    current().emitResult(0, [result("hello", true)]);
    for (let i = 0; i < 3; i += 1) {
      current().emitEnd();
    }
    // One more end past the cap should just deliver, not restart again.
    current().emitEnd();

    expect(finals).toEqual(["hello"]);
  });

  it("forwards onerror codes, and treats no-speech/aborted as non-fatal (session can still restart)", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createRecognizer({}, { window: hostWith(Ctor) });
    const errors: string[] = [];
    const finals: string[] = [];
    recognizer.start({ onFinal: (text) => finals.push(text), onError: (code) => errors.push(code) });

    current().emitError("no-speech");
    current().emitEnd();
    expect(errors).toEqual(["no-speech"]);
    expect(Ctor).toHaveBeenCalledTimes(2); // restarted rather than stopping for good

    recognizer.stop();
    current().emitEnd();
  });

  it("treats not-allowed as fatal: stops the engine and delivers onFinal once the session ends", () => {
    const { Ctor, current } = fakeConstructor();
    const recognizer = createRecognizer({}, { window: hostWith(Ctor) });
    const finals: string[] = [];
    recognizer.start({ onFinal: (text) => finals.push(text) });

    current().emitResult(0, [result("hello", true)]);
    current().emitError("not-allowed");
    expect(current().stopped).toBe(1); // we proactively stop on a fatal error
    current().emitEnd();

    expect(finals).toEqual(["hello"]);
  });

  it("sets processLocally on the instance once available() resolves 'available'", async () => {
    const { Ctor, current } = fakeConstructor({ available: async () => "available" });
    const recognizer = createRecognizer({ lang: "en-US" }, { window: hostWith(Ctor) });
    expect(recognizer.supported).toBe(true);

    // available() is async; let its promise settle before the first start().
    await Promise.resolve();
    await Promise.resolve();

    recognizer.start({ onFinal: () => undefined });
    expect(current().processLocally).toBe(true);
  });

  it("does not set processLocally when available() rejects (defensive against Chromium bugs)", async () => {
    const { Ctor, current } = fakeConstructor({ available: async () => Promise.reject(new Error("boom")) });
    const recognizer = createRecognizer({}, { window: hostWith(Ctor) });

    await Promise.resolve();
    await Promise.resolve();

    recognizer.start({ onFinal: () => undefined });
    expect(current().processLocally).toBe(false);
  });
});

describe("installOnDeviceSpeech", () => {
  it("returns false when there's no constructor", async () => {
    await expect(installOnDeviceSpeech("en-US", { window: {} })).resolves.toBe(false);
  });

  it("returns false when the constructor has no install()", async () => {
    const { Ctor } = fakeConstructor();
    await expect(installOnDeviceSpeech("en-US", { window: hostWith(Ctor) })).resolves.toBe(false);
  });

  it("calls install({ langs }) and returns its result", async () => {
    const install = vi.fn(async () => true);
    const { Ctor } = fakeConstructor({ install });
    await expect(installOnDeviceSpeech("en-US", { window: hostWith(Ctor) })).resolves.toBe(true);
    expect(install).toHaveBeenCalledWith({ langs: ["en-US"] });
  });

  it("returns false if install() throws", async () => {
    const { Ctor } = fakeConstructor({ install: async () => Promise.reject(new Error("boom")) });
    await expect(installOnDeviceSpeech("en-US", { window: hostWith(Ctor) })).resolves.toBe(false);
  });
});
