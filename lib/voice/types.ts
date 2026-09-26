// Contracts for talking to the council with browser built-ins: SpeechRecognition hears the mission,
// speechSynthesis gives each sprite a voice. The director only sees these interfaces, so a paid
// engine (OpenAI, Deepgram, ElevenLabs) can replace either side later without touching it.

/**
 * unsupported: no SpeechRecognition (Firefox), so voice UI hides and typing is the only path.
 * locked: speechSynthesis still needs one click or key press (Leap gestures don't count as activation).
 */
export type VoiceStatus = "unsupported" | "locked" | "idle" | "listening";

export interface RecognizerHandlers {
  /** The transcript so far, while the user is still talking. */
  onInterim?: (text: string) => void;
  /** Fires once per start() after stop(), with everything heard (possibly ""). Never fires after abort(). */
  onFinal: (text: string) => void;
  /** SpeechRecognitionErrorEvent codes: "not-allowed", "no-speech", "network", "language-not-supported", ... */
  onError?: (code: string) => void;
}

export interface Recognizer {
  readonly supported: boolean;
  /** Opens the mic. Calling it while already listening is a no-op. */
  start(handlers: RecognizerHandlers): void;
  /** Stops listening and delivers the final transcript through onFinal. */
  stop(): void;
  /** Stops listening and discards the transcript (reset). */
  abort(): void;
}

export interface RecognizerOptions {
  /** BCP 47, default "en-US". */
  lang?: string;
}

export interface Speaker {
  readonly supported: boolean;
  /** True once a user activation has let speechSynthesis speak. */
  readonly unlocked: boolean;
  /** Call from (or after) a click or key press. Speaks a silent utterance so later speak() calls are allowed. */
  unlock(): void;
  /** Speaks in the sprite's persona voice. Resolves when done, on error, on cancel, or after a safety timeout. */
  speak(spriteId: string, text: string): Promise<void>;
  /** Stops speaking now and resolves every pending speak(). */
  cancel(): void;
}

export type CreateRecognizer = (options?: RecognizerOptions) => Recognizer;
export type CreateSpeaker = () => Speaker;

/** No-op engines for tests, SSR, and until the real ones are wired in. */
export function createVoiceStubs(): { recognizer: Recognizer; speaker: Speaker } {
  return {
    recognizer: { supported: false, start: () => undefined, stop: () => undefined, abort: () => undefined },
    speaker: {
      supported: false,
      unlocked: false,
      unlock: () => undefined,
      speak: () => Promise.resolve(),
      cancel: () => undefined,
    },
  };
}
