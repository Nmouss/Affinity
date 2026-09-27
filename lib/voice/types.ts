// Contracts for the spoken interview's two engines. The interview hook only ever sees these, so
// Deepgram (default), the browser's own Web Speech APIs (fallback), or the stubs (SSR, tests, no
// mic) are interchangeable. Recognizer: microphone → text. Speaker: text → audio.

export interface RecognizerHandlers {
  /** The transcript so far while the person is still talking. */
  onInterim?: (text: string) => void;
  /** Fires once per start() after stop() (or after a fatal error), with everything heard, possibly "". Never after abort(). */
  onFinal: (text: string) => void;
  /** The engine heard the person stop talking (Deepgram endpointing / utterance end). */
  onSilence?: () => void;
  /** The engine heard the person start talking. */
  onSpeechStart?: () => void;
  /** "not-allowed" | "network" | "no-speech" | "unsupported" | engine-specific codes. */
  onError?: (code: string) => void;
}

export interface Recognizer {
  readonly supported: boolean;
  /** Opens the mic. Calling it while already listening is a no-op. */
  start(handlers: RecognizerHandlers): void;
  /** Stops listening and delivers the final transcript through onFinal. */
  stop(): void;
  /** Stops listening and discards the transcript. */
  abort(): void;
}

export interface RecognizerOptions {
  /** BCP 47, default "en-US". */
  lang?: string;
}

export interface Speaker {
  /** False once the engine has proven unusable (no key, no audio); the caller should fall back. */
  readonly supported: boolean;
  /** Call from a click or key press: primes audio playback so later speak() calls are allowed. */
  unlock(): void;
  /** Speaks the text. Resolves when done, on error, on cancel, or after a safety timeout. */
  speak(text: string): Promise<void>;
  /** Stops speaking now and resolves every pending speak(). */
  cancel(): void;
  /** Optional: warm the fixed lines so later speak() calls start instantly. */
  prefetch?(texts: string[]): void;
}

/** No-op engines for tests, SSR, and typed-only sessions. */
export function createVoiceStubs(): { recognizer: Recognizer; speaker: Speaker } {
  return {
    recognizer: { supported: false, start: () => undefined, stop: () => undefined, abort: () => undefined },
    speaker: { supported: false, unlock: () => undefined, speak: () => Promise.resolve(), cancel: () => undefined },
  };
}
