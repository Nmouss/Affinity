import type { RecorderCtorLike, RecorderLike, StreamLike } from "./deepgramRecognizer";
import type { Recognizer, RecognizerHandlers } from "./types";

// Deepgram prerecorded speech-to-text: record the whole answer in the browser, then post the blob to
// /api/voice/transcribe (the key stays server-side). Used when a live socket isn't possible: the
// key cannot mint browser tokens, or the browser records mp4 rather than webm. No interim words, so
// end-of-speech comes from a local loudness watch: after speech is heard, ~1.5 s under the threshold
// means the answer is over.

export const TRANSCRIBE_ROUTE = "/api/voice/transcribe";
const CHUNK_MS = 500;
const DEFAULT_SILENCE_MS = 1500;
const DEFAULT_POLL_MS = 100;
/** RMS of the analyser's time-domain samples (0..1) above which we call it speech. */
const DEFAULT_SPEECH_RMS = 0.02;

export interface AnalyserLike {
  fftSize: number;
  getByteTimeDomainData(target: Uint8Array): void;
}
export interface AudioContextLike {
  createMediaStreamSource(stream: StreamLike): { connect(node: AnalyserLike): void };
  createAnalyser(): AnalyserLike;
  close(): Promise<void> | void;
}

export interface DeepgramBatchRecognizerDeps {
  /** Posts the recording and returns the transcript; null when transcription is unavailable. */
  transcribe?: (blob: Blob) => Promise<string | null>;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<StreamLike>;
  MediaRecorderCtor?: RecorderCtorLike;
  AudioContextCtor?: new () => AudioContextLike;
  isTypeSupported?: (mime: string) => boolean;
  silenceMs?: number;
  pollMs?: number;
  speechRms?: number;
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
}

/** The first recordable type in order of preference; Deepgram accepts all of them. */
export const BATCH_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function pickRecordingMime(isTypeSupported?: (mime: string) => boolean): string | null {
  if (!isTypeSupported) return null;
  return BATCH_MIME_CANDIDATES.find((mime) => isTypeSupported(mime)) ?? null;
}

/** Default transport: the Next route, with the blob's own type so the server forwards it as-is. */
export async function transcribeViaRoute(blob: Blob, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetchImpl(TRANSCRIBE_ROUTE, {
      method: "POST",
      headers: { "Content-Type": blob.type.split(";")[0] || "audio/webm" },
      body: blob,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { transcript?: string };
    return body.transcript ?? "";
  } catch {
    return null;
  }
}

function rms(samples: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const centered = (samples[i]! - 128) / 128;
    sum += centered * centered;
  }
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

export function createDeepgramBatchRecognizer(deps: DeepgramBatchRecognizerDeps = {}): Recognizer {
  const getUserMedia =
    deps.getUserMedia ??
    (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
      ? (constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints) as Promise<StreamLike>
      : undefined);
  const RecorderCtor = deps.MediaRecorderCtor ?? (typeof MediaRecorder !== "undefined" ? (MediaRecorder as unknown as RecorderCtorLike) : undefined);
  const AudioCtor =
    deps.AudioContextCtor ??
    (typeof window !== "undefined" && "AudioContext" in window ? (window.AudioContext as unknown as new () => AudioContextLike) : undefined);
  const isTypeSupported = deps.isTypeSupported ?? RecorderCtor?.isTypeSupported?.bind(RecorderCtor);
  const mime = pickRecordingMime(isTypeSupported);
  const transcribe = deps.transcribe ?? transcribeViaRoute;
  const silenceMs = deps.silenceMs ?? DEFAULT_SILENCE_MS;
  const pollMs = deps.pollMs ?? DEFAULT_POLL_MS;
  const speechRms = deps.speechRms ?? DEFAULT_SPEECH_RMS;
  const setIntervalImpl = deps.setIntervalImpl ?? setInterval;
  const clearIntervalImpl = deps.clearIntervalImpl ?? clearInterval;

  const supported = Boolean(getUserMedia && RecorderCtor && mime);

  let session = 0;
  let active = false;
  let stream: StreamLike | null = null;
  let recorder: RecorderLike | null = null;
  let audio: AudioContextLike | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;
  let chunks: Blob[] = [];
  let handlers: RecognizerHandlers | null = null;
  let stopping = false;

  function teardown() {
    if (poll) clearIntervalImpl(poll);
    poll = null;
    try {
      recorder?.stop();
    } catch {
      // Already stopped.
    }
    recorder = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    void audio?.close();
    audio = null;
    active = false;
    stopping = false;
  }

  function watchLoudness(mySession: number, mediaStream: StreamLike) {
    if (!AudioCtor) return;
    try {
      audio = new AudioCtor();
      const analyser = audio.createAnalyser();
      analyser.fftSize = 1024;
      audio.createMediaStreamSource(mediaStream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let heard = false;
      let quietFor = 0;
      poll = setIntervalImpl(() => {
        if (mySession !== session || !active) return;
        analyser.getByteTimeDomainData(samples);
        const level = rms(samples);
        if (level >= speechRms) {
          if (!heard) {
            heard = true;
            handlers?.onSpeechStart?.();
          }
          quietFor = 0;
          return;
        }
        if (!heard) return;
        quietFor += pollMs;
        if (quietFor >= silenceMs && !stopping) {
          quietFor = 0;
          handlers?.onSilence?.();
        }
      }, pollMs);
    } catch {
      // No loudness watch: the answer ends on Done or the caller's cap.
    }
  }

  return {
    supported,
    start(next) {
      if (!supported || active) return;
      active = true;
      stopping = false;
      chunks = [];
      handlers = next;
      const mySession = ++session;
      getUserMedia!({ audio: true })
        .then((mediaStream) => {
          if (mySession !== session || !active) {
            mediaStream.getTracks().forEach((track) => track.stop());
            return;
          }
          stream = mediaStream;
          recorder = new RecorderCtor!(mediaStream, { mimeType: mime! });
          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) chunks.push(event.data);
          };
          recorder.start(CHUNK_MS);
          watchLoudness(mySession, mediaStream);
        })
        .catch(() => {
          if (mySession !== session) return;
          active = false;
          handlers?.onError?.("not-allowed");
        });
    },
    stop() {
      if (!active || stopping) return;
      stopping = true;
      const mySession = session;
      const finish = () => {
        const collected = chunks;
        chunks = [];
        const blob = new Blob(collected, { type: mime ?? "audio/webm" });
        teardown();
        if (mySession !== session) return;
        if (blob.size === 0) {
          handlers?.onFinal("");
          return;
        }
        void transcribe(blob).then((text) => {
          if (mySession !== session) return;
          if (text === null) {
            handlers?.onError?.("network");
            handlers?.onFinal("");
            return;
          }
          handlers?.onFinal(text.trim());
        });
      };
      // Wait for the recorder's last chunk before assembling the blob.
      const current = recorder;
      if (current) {
        const previous = current.ondataavailable;
        current.ondataavailable = (event) => {
          previous?.(event);
          current.ondataavailable = previous;
          finish();
        };
        try {
          current.stop();
          return;
        } catch {
          // Fall through: assemble what we have.
        }
      }
      finish();
    },
    abort() {
      session += 1;
      teardown();
      chunks = [];
    },
  };
}
