// Deepgram live speech-to-text from the browser: microphone → MediaRecorder (webm/opus, 250 ms
// chunks) → wss://api.deepgram.com/v1/listen, authenticated with a short-lived token the server
// minted (carried in the WebSocket subprotocol; browsers cannot set headers). One socket per
// answer, no reconnect loop: a dropped socket mid-answer is an error and the interview falls back
// to typing. Everything browser-specific is injectable so vitest (node) can drive fakes.
import type { Recognizer, RecognizerHandlers } from "./types";

export const DEEPGRAM_LISTEN_URL = "wss://api.deepgram.com/v1/listen";

/** Endpointing (silence) and utterance-end (word gaps) both mark "the person stopped"; Deepgram
 *  recommends using them together. Containerized webm needs no encoding/sample_rate params. */
export const DEEPGRAM_LISTEN_PARAMS: Record<string, string> = {
  model: "nova-3",
  smart_format: "true",
  interim_results: "true",
  endpointing: "1500",
  utterance_end_ms: "1500",
  vad_events: "true",
};

export const WEBM_OPUS_MIME = "audio/webm;codecs=opus";
const CHUNK_MS = 250;
const DEFAULT_SAFETY_MS = 1500;

export function buildListenUrl(base: string = DEEPGRAM_LISTEN_URL, params: Record<string, string> = DEEPGRAM_LISTEN_PARAMS): string {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return `${base}?${query}`;
}

// Minimal shapes of the browser APIs we touch, so tests can pass plain fakes.
export interface TrackLike {
  stop(): void;
}
export interface StreamLike {
  getTracks(): TrackLike[];
}
export interface RecorderLike {
  start(timeslice?: number): void;
  stop(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onerror?: ((event: unknown) => void) | null;
}
export interface RecorderCtorLike {
  new (stream: StreamLike, options?: { mimeType?: string }): RecorderLike;
  isTypeSupported?: (mime: string) => boolean;
}
export interface SocketLike {
  readonly readyState: number;
  send(data: string | Blob | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}
export interface SocketCtorLike {
  new (url: string, protocols?: string | string[]): SocketLike;
  readonly OPEN?: number;
}

export interface DeepgramRecognizerDeps {
  /** Short-lived token from POST /api/voice/token; null when the server has no Deepgram key. */
  getToken: () => Promise<string | null>;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<StreamLike>;
  WebSocketCtor?: SocketCtorLike;
  MediaRecorderCtor?: RecorderCtorLike;
  isTypeSupported?: (mime: string) => boolean;
  url?: string;
  /** How long stop() waits for Deepgram's last is_final before delivering what it has. */
  safetyMs?: number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

const SOCKET_OPEN = 1;

function joinText(final: string, interim: string): string {
  return `${final} ${interim}`.replace(/\s+/g, " ").trim();
}

interface DeepgramResults {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: { alternatives?: Array<{ transcript?: string }> };
}

export function createDeepgramRecognizer(deps: DeepgramRecognizerDeps): Recognizer {
  const getUserMedia =
    deps.getUserMedia ??
    (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
      ? (constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints) as Promise<StreamLike>
      : undefined);
  const WebSocketCtor = deps.WebSocketCtor ?? (typeof WebSocket !== "undefined" ? (WebSocket as unknown as SocketCtorLike) : undefined);
  const MediaRecorderCtor =
    deps.MediaRecorderCtor ?? (typeof MediaRecorder !== "undefined" ? (MediaRecorder as unknown as RecorderCtorLike) : undefined);
  const isTypeSupported = deps.isTypeSupported ?? MediaRecorderCtor?.isTypeSupported ?? (() => false);
  const url = deps.url ?? buildListenUrl();
  const safetyMs = deps.safetyMs ?? DEFAULT_SAFETY_MS;
  const setTimer = deps.setTimeoutImpl ?? setTimeout;
  const clearTimer = deps.clearTimeoutImpl ?? clearTimeout;

  const supported = Boolean(getUserMedia && WebSocketCtor && MediaRecorderCtor && isTypeSupported(WEBM_OPUS_MIME));

  // One "session" per start(); async continuations check it so a stale getUserMedia or token
  // resolving after abort() is dropped (and its tracks stopped) instead of reviving the mic.
  let session = 0;
  let active = false;
  let handlers: RecognizerHandlers | null = null;
  let stream: StreamLike | null = null;
  let recorder: RecorderLike | null = null;
  let socket: SocketLike | null = null;
  let finalText = "";
  let interimText = "";
  let stopping = false;
  let finalDelivered = false;
  let spoke = false;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;

  function clearSafety() {
    if (safetyTimer !== null) {
      clearTimer(safetyTimer);
      safetyTimer = null;
    }
  }

  function teardown() {
    clearSafety();
    const currentRecorder = recorder;
    recorder = null;
    try {
      currentRecorder?.stop();
    } catch {
      // Already stopped.
    }
    const currentSocket = socket;
    socket = null;
    if (currentSocket) {
      currentSocket.onmessage = null;
      currentSocket.onclose = null;
      currentSocket.onerror = null;
      currentSocket.onopen = null;
      try {
        currentSocket.close(1000, "done");
      } catch {
        // Already closed.
      }
    }
    stopTracks(stream);
    stream = null;
    active = false;
    stopping = false;
  }

  function stopTracks(target: StreamLike | null) {
    for (const track of target?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        // Track already ended.
      }
    }
  }

  function deliverFinal() {
    if (finalDelivered) return;
    finalDelivered = true;
    const text = finalText.trim() || interimText.trim();
    handlers?.onFinal(text);
  }

  function handleMessage(raw: unknown) {
    if (typeof raw !== "string") return;
    let message: DeepgramResults;
    try {
      message = JSON.parse(raw) as DeepgramResults;
    } catch {
      return;
    }
    if (message.type === "SpeechStarted") {
      if (!spoke) {
        spoke = true;
        handlers?.onSpeechStart?.();
      }
      return;
    }
    if (message.type === "UtteranceEnd") {
      handlers?.onSilence?.();
      return;
    }
    if (message.type !== "Results") return;
    const transcript = message.channel?.alternatives?.[0]?.transcript ?? "";
    if (message.is_final) {
      if (transcript.trim()) finalText = joinText(finalText, transcript);
      interimText = "";
    } else {
      interimText = transcript;
    }
    const full = joinText(finalText, interimText);
    if (full && !spoke) {
      spoke = true;
      handlers?.onSpeechStart?.();
    }
    handlers?.onInterim?.(full);
    if (message.speech_final) handlers?.onSilence?.();
    if (stopping && message.is_final) {
      deliverFinal();
      teardown();
    }
  }

  function fail(code: string) {
    handlers?.onError?.(code);
    if (!finalDelivered && (finalText || interimText)) deliverFinal();
    else if (!finalDelivered && stopping) deliverFinal();
    teardown();
  }

  async function open(mySession: number, nextHandlers: RecognizerHandlers) {
    let mediaStream: StreamLike;
    try {
      mediaStream = await getUserMedia!({ audio: true });
    } catch {
      if (mySession !== session) return;
      handlers?.onError?.("not-allowed");
      active = false;
      return;
    }
    if (mySession !== session) {
      stopTracks(mediaStream);
      return;
    }
    stream = mediaStream;

    let token: string | null;
    try {
      token = await deps.getToken();
    } catch {
      token = null;
    }
    if (mySession !== session) {
      stopTracks(mediaStream);
      return;
    }
    if (!token) {
      nextHandlers.onError?.("unsupported");
      stopTracks(mediaStream);
      stream = null;
      active = false;
      return;
    }

    let ws: SocketLike;
    try {
      ws = new WebSocketCtor!(url, ["bearer", token]);
    } catch {
      fail("network");
      return;
    }
    socket = ws;
    ws.onopen = () => {
      if (mySession !== session || socket !== ws) return;
      try {
        const rec = new MediaRecorderCtor!(mediaStream, { mimeType: WEBM_OPUS_MIME });
        rec.ondataavailable = (event) => {
          if (socket === ws && ws.readyState === SOCKET_OPEN && event.data && (event.data as Blob).size !== 0) ws.send(event.data);
        };
        recorder = rec;
        rec.start(CHUNK_MS);
      } catch {
        fail("unsupported");
      }
    };
    ws.onmessage = (event) => {
      if (mySession !== session || socket !== ws) return;
      handleMessage(event.data);
    };
    ws.onerror = () => undefined; // close always follows
    ws.onclose = () => {
      if (mySession !== session || socket !== ws) return;
      if (stopping) {
        // Deepgram closed after our CloseStream without a further is_final: deliver what we have.
        deliverFinal();
        teardown();
        return;
      }
      fail("network");
    };
  }

  function start(nextHandlers: RecognizerHandlers) {
    if (!supported || active) return;
    session += 1;
    active = true;
    handlers = nextHandlers;
    finalText = "";
    interimText = "";
    stopping = false;
    finalDelivered = false;
    spoke = false;
    void open(session, nextHandlers);
  }

  function stop() {
    if (!active || stopping) return;
    stopping = true;
    try {
      recorder?.stop();
    } catch {
      // Already stopped.
    }
    recorder = null;
    if (socket && socket.readyState === SOCKET_OPEN) {
      try {
        socket.send(JSON.stringify({ type: "CloseStream" }));
      } catch {
        // Socket gone; the safety timer delivers.
      }
    }
    safetyTimer = setTimer(() => {
      safetyTimer = null;
      deliverFinal();
      teardown();
    }, safetyMs);
  }

  function abort() {
    if (!active) return;
    session += 1;
    finalDelivered = true; // never deliver after abort
    teardown();
  }

  return { supported, start, stop, abort };
}
