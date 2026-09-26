// Push-to-talk speech capture. Uses the browser's Web Speech API when present; otherwise the UI
// offers the preloaded demo transcript. The microphone is only open between press and release.

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = () => recognitionCtor() !== null;

export interface SpeechSession {
  /** Stop listening and resolve with the final transcript ("" when nothing was heard). */
  stop(): Promise<string>;
  cancel(): void;
}

/** Starts listening. Returns null when speech recognition isn't available. */
export function startSpeech(onInterim?: (text: string) => void): SpeechSession | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  let finalText = "";
  let interimText = "";
  let failed: string | null = null;
  let settle: ((text: string) => void) | null = null;
  let rejectSettle: ((error: Error) => void) | null = null;
  let ended = false;

  recognition.onresult = (event) => {
    interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) finalText += result[0].transcript;
      else interimText += result[0].transcript;
    }
    onInterim?.((finalText + interimText).trim());
  };
  recognition.onerror = (event) => {
    failed = event.error;
  };
  recognition.onend = () => {
    ended = true;
    if (failed && failed !== "no-speech" && failed !== "aborted") rejectSettle?.(new Error(failed));
    else settle?.((finalText + interimText).trim());
  };

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    stop() {
      return new Promise<string>((resolve, reject) => {
        settle = resolve;
        rejectSettle = reject;
        if (ended) {
          if (failed && failed !== "no-speech") reject(new Error(failed));
          else resolve((finalText + interimText).trim());
          return;
        }
        recognition.stop();
        // Some browsers never fire onend after stop(); don't leave the presenter waiting.
        setTimeout(() => resolve((finalText + interimText).trim()), 2500);
      });
    },
    cancel() {
      recognition.abort();
    },
  };
}
