// The browser's own speech APIs as the fallback engines: SpeechRecognition (Chrome, Edge, Safari)
// hears the answer, speechSynthesis reads the question. Ported from the mvp/voice branch with one
// interviewer voice instead of per-sprite personas. TS's lib.dom ships the result types but not
// SpeechRecognition itself, so the minimal surface is declared here; everything is injectable so
// vitest (node) can drive fakes.
import type { Recognizer, RecognizerHandlers, RecognizerOptions, Speaker } from "./types";

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: ((event: Event) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
}

type OnDeviceAvailability = "available" | "downloadable" | "downloading" | "unavailable";

interface OnDeviceOptions {
  langs: string[];
  processLocally?: boolean;
}

interface SpeechRecognitionConstructorLike {
  new (): SpeechRecognitionLike;
  available?: (options: OnDeviceOptions) => Promise<OnDeviceAvailability>;
  install?: (options: OnDeviceOptions) => Promise<boolean>;
}

/** The bit of `window` the recognizer needs — a real window in the browser, a fake object in tests. */
export interface RecognitionHost {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
}

export interface RecognizerDeps {
  /** Defaults to the global `window`. */
  window?: RecognitionHost;
}

const DEFAULT_LANG = "en-US";
/** Chrome sometimes ends a continuous session on its own (silence); restart transparently. */
const MAX_AUTO_RESTARTS = 3;
/** If `end` never fires after stop(), deliver whatever transcript we have instead of hanging. */
const STOP_SAFETY_TIMEOUT_MS = 1500;
const FATAL_ERROR_CODES = new Set(["not-allowed", "service-not-allowed", "language-not-supported", "network"]);

function resolveHost(deps: RecognizerDeps): RecognitionHost | undefined {
  if (deps.window) return deps.window;
  return typeof window === "undefined" ? undefined : (window as unknown as RecognitionHost);
}

function appendTranscript(base: string, next: string): string {
  const trimmedNext = next.trim();
  if (!trimmedNext) return base;
  return base ? `${base} ${trimmedNext}` : trimmedNext;
}

/** Downloads Chrome's on-device model; slow and shows UI, so only ever an explicit setup step. */
export async function installOnDeviceSpeech(lang: string = DEFAULT_LANG, deps: RecognizerDeps = {}): Promise<boolean> {
  const host = resolveHost(deps);
  const Ctor = host?.SpeechRecognition ?? host?.webkitSpeechRecognition;
  if (!Ctor || typeof Ctor.install !== "function") return false;
  try {
    return await Ctor.install({ langs: [lang] });
  } catch {
    return false;
  }
}

export function createWebSpeechRecognizer(options: RecognizerOptions = {}, deps: RecognizerDeps = {}): Recognizer {
  const lang = options.lang ?? DEFAULT_LANG;
  const host = resolveHost(deps);
  const Ctor = host?.SpeechRecognition ?? host?.webkitSpeechRecognition;
  const supported = Boolean(Ctor);

  let onDeviceReady = false;
  if (Ctor && typeof Ctor.available === "function") {
    Ctor.available({ langs: [lang], processLocally: true })
      .then((status) => {
        onDeviceReady = status === "available";
      })
      .catch(() => undefined);
  }

  let instance: SpeechRecognitionLike | null = null;
  let handlers: RecognizerHandlers | null = null;
  let listening = false;
  let finalTranscript = "";
  let interimText = "";
  let restartCount = 0;
  let stopRequested = false;
  let abortRequested = false;
  let fatalStop = false;
  let finalDelivered = false;
  let spoke = false;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;

  const fullTranscript = () => appendTranscript(finalTranscript, interimText);

  function clearSafetyTimer() {
    if (safetyTimer !== null) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
  }

  function deliverFinal() {
    if (finalDelivered) return;
    finalDelivered = true;
    handlers?.onFinal(fullTranscript().trim());
  }

  function cleanupInstance() {
    if (instance) {
      instance.onresult = null;
      instance.onerror = null;
      instance.onend = null;
    }
    instance = null;
  }

  function handleResult(event: SpeechRecognitionEventLike) {
    let interimChunk = "";
    let sawFinal = false;
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) {
        finalTranscript = appendTranscript(finalTranscript, text);
        sawFinal = true;
      } else {
        interimChunk += text;
      }
    }
    interimText = interimChunk;
    const full = fullTranscript();
    if (!spoke && full.trim()) {
      spoke = true;
      handlers?.onSpeechStart?.();
    }
    handlers?.onInterim?.(full);
    // A final result with no trailing interim is Web Speech's version of "the person paused".
    if (sawFinal && !interimChunk.trim()) handlers?.onSilence?.();
  }

  function handleError(event: SpeechRecognitionErrorEventLike) {
    const code = event.error;
    handlers?.onError?.(code);
    if (FATAL_ERROR_CODES.has(code)) {
      fatalStop = true;
      try {
        instance?.stop();
      } catch {
        // Already stopping; `end` still fires.
      }
    }
  }

  function attach(target: SpeechRecognitionLike) {
    target.onresult = handleResult;
    target.onerror = handleError;
    target.onend = handleEnd;
  }

  function ensureInstance(): SpeechRecognitionLike {
    if (instance) return instance;
    const created = new (Ctor as SpeechRecognitionConstructorLike)();
    created.continuous = true;
    created.interimResults = true;
    created.lang = lang;
    created.maxAlternatives = 1;
    if (onDeviceReady) created.processLocally = true;
    attach(created);
    instance = created;
    return created;
  }

  function safeStart(target: SpeechRecognitionLike) {
    try {
      target.start();
    } catch (err) {
      const name = (err as { name?: string } | undefined)?.name;
      if (name !== "InvalidStateError") handlers?.onError?.(typeof name === "string" ? name : "start-failed");
    }
  }

  function handleEnd() {
    clearSafetyTimer();
    if (abortRequested) {
      listening = false;
      cleanupInstance();
      return;
    }
    if (stopRequested || fatalStop) {
      deliverFinal();
      listening = false;
      cleanupInstance();
      return;
    }
    if (restartCount < MAX_AUTO_RESTARTS) {
      restartCount += 1;
      cleanupInstance();
      safeStart(ensureInstance());
      return;
    }
    deliverFinal();
    listening = false;
    cleanupInstance();
  }

  function start(nextHandlers: RecognizerHandlers) {
    if (!supported || listening) return;
    handlers = nextHandlers;
    finalTranscript = "";
    interimText = "";
    restartCount = 0;
    stopRequested = false;
    abortRequested = false;
    fatalStop = false;
    finalDelivered = false;
    spoke = false;
    listening = true;
    safeStart(ensureInstance());
  }

  function stop() {
    if (!listening) return;
    stopRequested = true;
    clearSafetyTimer();
    safetyTimer = setTimeout(() => {
      safetyTimer = null;
      deliverFinal();
      listening = false;
      cleanupInstance();
    }, STOP_SAFETY_TIMEOUT_MS);
    try {
      instance?.stop();
    } catch {
      // The safety timeout still delivers onFinal.
    }
  }

  function abort() {
    if (!listening) return;
    abortRequested = true;
    listening = false;
    clearSafetyTimer();
    try {
      instance?.abort();
    } catch {
      // Nothing to discard.
    }
  }

  return { supported, start, stop, abort };
}

// ---------------------------------------------------------------------------------------------
// Speaker

export type VoiceLike = Pick<SpeechSynthesisVoice, "name" | "lang" | "localService" | "default">;

export interface UtteranceLike {
  text: string;
  voice?: VoiceLike | null;
  pitch?: number;
  rate?: number;
  volume?: number;
  onend: ((event?: unknown) => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
}

export interface SpeechSynthesisLike {
  getVoices(): VoiceLike[];
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  resume(): void;
  addEventListener(type: "voiceschanged", listener: () => void): void;
  removeEventListener(type: "voiceschanged", listener: () => void): void;
}

export interface WebSpeechSpeakerDeps {
  /** Defaults to the global `speechSynthesis`. */
  synth?: SpeechSynthesisLike;
  /** Defaults to `new SpeechSynthesisUtterance(text)`. */
  createUtterance?: (text: string) => UtteranceLike;
}

/** Chrome can silently pause a long utterance queue; nudging resume() periodically works around it. */
const RESUME_WORKAROUND_MS = 10_000;

function resolveSynth(deps: WebSpeechSpeakerDeps): SpeechSynthesisLike | undefined {
  if (deps.synth) return deps.synth;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return undefined;
  return window.speechSynthesis as unknown as SpeechSynthesisLike;
}

function resolveCreateUtterance(deps: WebSpeechSpeakerDeps): (text: string) => UtteranceLike {
  if (deps.createUtterance) return deps.createUtterance;
  return (text: string) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike;
}

/** Sentence split so a stuck engine loses at most one sentence, not the whole question. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** One warm, local English voice for the interviewer: a local en-* voice, else the engine default. */
export function pickInterviewerVoice(voices: readonly VoiceLike[]): VoiceLike | null {
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  return english.find((voice) => voice.localService) ?? english.find((voice) => voice.default) ?? english[0] ?? null;
}

interface PendingSpeak {
  resolve: () => void;
  safetyTimer: ReturnType<typeof setTimeout> | null;
  resolved: boolean;
}

export function createWebSpeechSpeaker(deps: WebSpeechSpeakerDeps = {}): Speaker {
  const synth = resolveSynth(deps);
  const createUtterance = resolveCreateUtterance(deps);
  let supported = Boolean(synth);
  let voices: VoiceLike[] = synth?.getVoices() ?? [];
  const pending = new Set<PendingSpeak>();
  let resumeTimer: ReturnType<typeof setInterval> | null = null;

  if (synth) {
    synth.addEventListener("voiceschanged", () => {
      voices = synth.getVoices();
    });
  }

  function startResumeWorkaround() {
    if (resumeTimer !== null || !synth) return;
    resumeTimer = setInterval(() => synth.resume(), RESUME_WORKAROUND_MS);
  }

  function stopResumeWorkaroundIfIdle() {
    if (pending.size === 0 && resumeTimer !== null) {
      clearInterval(resumeTimer);
      resumeTimer = null;
    }
  }

  function unlock() {
    if (!supported || !synth) return;
    const utterance = createUtterance(" ");
    utterance.volume = 0;
    utterance.onerror = () => undefined;
    try {
      synth.speak(utterance);
    } catch {
      // Activation is sticky; a real speak() later confirms or corrects this.
    }
  }

  function speak(text: string): Promise<void> {
    if (!supported || !synth) return Promise.resolve();
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve();
    const sentences = splitSentences(trimmed);
    if (sentences.length === 0) return Promise.resolve();
    const voice = pickInterviewerVoice(voices);

    return new Promise<void>((resolvePromise) => {
      const entry: PendingSpeak = { resolve: () => undefined, safetyTimer: null, resolved: false };
      const finish = () => {
        if (entry.resolved) return;
        entry.resolved = true;
        if (entry.safetyTimer !== null) clearTimeout(entry.safetyTimer);
        pending.delete(entry);
        stopResumeWorkaroundIfIdle();
        resolvePromise();
      };
      entry.resolve = finish;
      pending.add(entry);
      startResumeWorkaround();
      entry.safetyTimer = setTimeout(finish, (trimmed.length / 10 + 2) * 1000);

      let index = 0;
      const speakNext = () => {
        if (index >= sentences.length) {
          finish();
          return;
        }
        const utterance = createUtterance(sentences[index]!);
        index += 1;
        if (voice) utterance.voice = voice;
        utterance.pitch = 1;
        utterance.rate = 1;
        utterance.onend = () => speakNext();
        utterance.onerror = (event) => {
          if (event?.error === "not-allowed") supported = false;
          finish();
        };
        synth.speak(utterance);
      };
      speakNext();
    });
  }

  function cancel() {
    synth?.cancel();
    for (const entry of Array.from(pending)) entry.resolve();
  }

  return {
    get supported() {
      return supported;
    },
    unlock,
    speak,
    cancel,
  };
}
