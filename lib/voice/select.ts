import { createDeepgramBatchRecognizer, pickRecordingMime, type DeepgramBatchRecognizerDeps } from "./deepgramBatchRecognizer";
import { createDeepgramRecognizer, type DeepgramRecognizerDeps } from "./deepgramRecognizer";
import { createDeepgramSpeaker, type DeepgramSpeakerDeps } from "./deepgramSpeaker";
import { createVoiceStubs, type Recognizer, type Speaker } from "./types";
import { createWebSpeechRecognizer, createWebSpeechSpeaker, type RecognitionHost, type SpeechSynthesisLike } from "./webSpeech";

// Which engine runs each side of the conversation, decided once per interview from what the browser
// and the server offer. Deepgram needs a configured key (the token route answers) and, for
// listening, a browser that records webm/opus (Chrome, Edge, Firefox); Safari lands on Web Speech
// or typing. Mic denial is discovered at runtime, not here.

export interface VoiceCapabilities {
  /** The server has a Deepgram key (the speak and transcribe routes work). */
  deepgramConfigured: boolean;
  /** The server can also mint short-lived browser tokens (needs a Member-role key) for live streaming. */
  deepgramTokens: boolean;
  webmOpus: boolean;
  /** Some recordable audio type exists (webm, mp4, ogg): enough for prerecorded transcription. */
  recordable: boolean;
  mediaDevices: boolean;
  webSpeechRecognition: boolean;
  speechSynthesis: boolean;
}

export type SpeakerChoice = "deepgram" | "browser" | "none";
/** `deepgram` streams live; `deepgramBatch` records the whole answer and transcribes it afterwards. */
export type RecognizerChoice = "deepgram" | "deepgramBatch" | "browser" | "none";
export type EngineChoice = SpeakerChoice | RecognizerChoice;

export interface EngineChoices {
  speaker: SpeakerChoice;
  recognizer: RecognizerChoice;
}

export function chooseEngines(c: VoiceCapabilities): EngineChoices {
  const speaker: SpeakerChoice = c.deepgramConfigured ? "deepgram" : c.speechSynthesis ? "browser" : "none";
  const recognizer: RecognizerChoice =
    c.deepgramConfigured && c.deepgramTokens && c.webmOpus && c.mediaDevices
      ? "deepgram"
      : c.deepgramConfigured && c.recordable && c.mediaDevices
        ? "deepgramBatch"
        : c.webSpeechRecognition
          ? "browser"
          : "none";
  return { speaker, recognizer };
}

interface WindowLike {
  MediaRecorder?: { isTypeSupported?: (mime: string) => boolean };
  navigator?: { mediaDevices?: { getUserMedia?: unknown } };
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
  speechSynthesis?: unknown;
  WebSocket?: unknown;
}

export const WEBM_OPUS = "audio/webm;codecs=opus";

export function detectCapabilities(win: WindowLike | undefined, deepgramConfigured: boolean, deepgramTokens = deepgramConfigured): VoiceCapabilities {
  if (!win) {
    return { deepgramConfigured, deepgramTokens, webmOpus: false, recordable: false, mediaDevices: false, webSpeechRecognition: false, speechSynthesis: false };
  }
  const isTypeSupported = win.MediaRecorder?.isTypeSupported;
  return {
    deepgramConfigured,
    deepgramTokens,
    webmOpus: Boolean(win.WebSocket) && typeof isTypeSupported === "function" && isTypeSupported(WEBM_OPUS),
    recordable: Boolean(win.MediaRecorder) && pickRecordingMime(typeof isTypeSupported === "function" ? isTypeSupported : undefined) !== null,
    mediaDevices: typeof win.navigator?.mediaDevices?.getUserMedia === "function",
    webSpeechRecognition: Boolean(win.SpeechRecognition ?? win.webkitSpeechRecognition),
    speechSynthesis: Boolean(win.speechSynthesis),
  };
}

export interface CreateEnginesDeps {
  deepgramRecognizer?: DeepgramRecognizerDeps;
  deepgramBatch?: DeepgramBatchRecognizerDeps;
  deepgramSpeaker?: DeepgramSpeakerDeps;
  /** Injected for tests; defaults to the global window. */
  webSpeechHost?: RecognitionHost;
  speechSynthesis?: SpeechSynthesisLike;
}

/** Instantiates the chosen engines; anything "none" becomes a stub. */
export function createEngines(choice: EngineChoices, deps: CreateEnginesDeps = {}): { recognizer: Recognizer; speaker: Speaker } {
  const stubs = createVoiceStubs();
  const recognizer =
    choice.recognizer === "deepgram" && deps.deepgramRecognizer
      ? createDeepgramRecognizer(deps.deepgramRecognizer)
      : choice.recognizer === "deepgramBatch"
        ? createDeepgramBatchRecognizer(deps.deepgramBatch)
        : choice.recognizer === "browser"
          ? createWebSpeechRecognizer({}, { window: deps.webSpeechHost })
          : stubs.recognizer;
  const speaker =
    choice.speaker === "deepgram"
      ? createDeepgramSpeaker(deps.deepgramSpeaker)
      : choice.speaker === "browser"
        ? createWebSpeechSpeaker({ synth: deps.speechSynthesis })
        : stubs.speaker;
  return { recognizer, speaker };
}
