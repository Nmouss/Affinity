// Web Speech API speech-to-text. TS's lib.dom ships the result/alternative types but not
// SpeechRecognition itself (it's still non-standard), so the minimal surface we need is declared
// below instead of pulling in a dependency for it.
import type { CreateRecognizer, Recognizer, RecognizerHandlers, RecognizerOptions } from "./types";

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
  /** Chrome's on-device recognition flag; absent entirely on engines that don't support it. */
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
  /** Newer Chromium only; probes whether on-device recognition is ready for `langs`. */
  available?: (options: OnDeviceOptions) => Promise<OnDeviceAvailability>;
  /** Triggers the one-time on-device model download; never called automatically (see below). */
  install?: (options: OnDeviceOptions) => Promise<boolean>;
}

/** The bit of `window` this module needs — a real window in the browser, a fake object in tests. */
export interface RecognitionHost {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
}

export interface RecognizerDeps {
  /** Defaults to the global `window`. Tests run under vitest's node environment, so they inject a fake. */
  window?: RecognitionHost;
}

const DEFAULT_LANG = "en-US";
/** Chrome sometimes ends a continuous session on its own (silence, "no-speech"); restart transparently. */
const MAX_AUTO_RESTARTS = 3;
/** If `end` never fires after stop(), deliver whatever transcript we have instead of hanging forever. */
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

/**
 * `SpeechRecognition.install()` downloads the on-device model; it's slow and shows a permission UI,
 * so we never call it implicitly from start(). Expose it as an explicit setup step instead.
 */
export async function installOnDeviceSpeech(lang: string = DEFAULT_LANG, deps: RecognizerDeps = {}): Promise<boolean> {
  const host = resolveHost(deps);
  const Ctor = host?.SpeechRecognition ?? host?.webkitSpeechRecognition;
  if (!Ctor || typeof Ctor.install !== "function") return false;
  try {
    return await Ctor.install({ langs: [lang] });
  } catch {
    // Chromium has open bugs around the on-device speech API on macOS; fall back to unavailable.
    return false;
  }
}

/** `createRecognizer` implements `CreateRecognizer`; the optional `deps` param is for test injection. */
export function createRecognizer(options: RecognizerOptions = {}, deps: RecognizerDeps = {}): Recognizer {
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
      .catch(() => {
        // available() has open Chromium bugs on macOS; treat a rejection as "stay on cloud".
      });
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
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) {
        finalTranscript = appendTranscript(finalTranscript, text);
      } else {
        interimChunk += text;
      }
    }
    interimText = interimChunk;
    handlers?.onInterim?.(fullTranscript());
  }

  function handleError(event: SpeechRecognitionErrorEventLike) {
    const code = event.error;
    handlers?.onError?.(code);
    if (FATAL_ERROR_CODES.has(code)) {
      fatalStop = true;
      try {
        instance?.stop();
      } catch {
        // Already stopping/stopped — the pending `end` handler will still fire.
      }
    }
    // "no-speech" and "aborted" are expected (silence timeout, our own abort()) and are not fatal:
    // the default `end` handling below (transparent restart, or the abort-discard path) covers them.
  }

  function attach(target: SpeechRecognitionLike) {
    target.onresult = handleResult;
    target.onerror = handleError;
    target.onend = handleEnd;
  }

  function ensureInstance(): SpeechRecognitionLike {
    if (instance) return instance;
    // Ctor is guaranteed defined here: start()/restart only reach this when supported is true.
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
      // Chrome throws InvalidStateError when start() races the engine's own startup; harmless here.
      const name = (err as { name?: string } | undefined)?.name;
      if (name !== "InvalidStateError") {
        handlers?.onError?.(typeof name === "string" ? name : "start-failed");
      }
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

    // Restart budget exhausted: stop trying and hand back whatever was heard.
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
      // Already stopped; the safety timeout above still delivers onFinal.
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

// Documents the intended contract shape without narrowing createRecognizer's own (wider, DI-friendly) type.
const _typecheck: CreateRecognizer = createRecognizer;
void _typecheck;
