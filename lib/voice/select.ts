import { createDeepgramRecognizer, type DeepgramRecognizerDeps } from "./deepgramRecognizer";
import { createDeepgramSpeaker, type DeepgramSpeakerDeps } from "./deepgramSpeaker";
import { createVoiceStubs, type Recognizer, type Speaker } from "./types";
import { createWebSpeechRecognizer, createWebSpeechSpeaker, type RecognitionHost, type SpeechSynthesisLike } from "./webSpeech";

// Which engine runs each side of the conversation, decided once per interview from what the browser
// and the server offer. Deepgram needs a configured key (the token route answers) and, for
// listening, a browser that records webm/opus (Chrome, Edge, Firefox); Safari lands on Web Speech
// or typing. Mic denial is discovered at runtime, not here.

export interface VoiceCapabilities {
  deepgramConfigured: boolean;
  webmOpus: boolean;
  mediaDevices: boolean;
  webSpeechRecognition: boolean;
  speechSynthesis: boolean;
}

export type EngineChoice = "deepgram" | "browser" | "none";

export interface EngineChoices {
  speaker: EngineChoice;
  recognizer: EngineChoice;
}

export function chooseEngines(c: VoiceCapabilities): EngineChoices {
  const speaker: EngineChoice = c.deepgramConfigured ? "deepgram" : c.speechSynthesis ? "browser" : "none";
  const recognizer: EngineChoice =
    c.deepgramConfigured && c.webmOpus && c.mediaDevices ? "deepgram" : c.webSpeechRecognition ? "browser" : "none";
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

export function detectCapabilities(win: WindowLike | undefined, deepgramConfigured: boolean): VoiceCapabilities {
  if (!win) {
    return { deepgramConfigured, webmOpus: false, mediaDevices: false, webSpeechRecognition: false, speechSynthesis: false };
  }
  const isTypeSupported = win.MediaRecorder?.isTypeSupported;
  return {
    deepgramConfigured,
    webmOpus: Boolean(win.WebSocket) && typeof isTypeSupported === "function" && isTypeSupported(WEBM_OPUS),
    mediaDevices: typeof win.navigator?.mediaDevices?.getUserMedia === "function",
    webSpeechRecognition: Boolean(win.SpeechRecognition ?? win.webkitSpeechRecognition),
    speechSynthesis: Boolean(win.speechSynthesis),
  };
}

export interface CreateEnginesDeps {
  deepgramRecognizer?: DeepgramRecognizerDeps;
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
