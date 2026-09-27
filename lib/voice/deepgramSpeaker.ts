// Deepgram Aura text-to-speech, fetched through our own /api/voice/speak route (the key stays on
// the server) and played on one reused <audio> element. The element is "unlocked" by playing a
// silent WAV inside the user's click, which satisfies Safari's autoplay policy for the later real
// clips. A 503 from the route (no key) flips `supported` off so the caller can fall back.
import { SILENT_WAV_DATA_URI } from "./silentAudio";
import type { Speaker } from "./types";

export interface AudioLike {
  src: string;
  currentTime: number;
  play(): Promise<void> | void;
  pause(): void;
  onended: ((event?: unknown) => void) | null;
  onerror: ((event?: unknown) => void) | null;
}

export interface DeepgramSpeakerDeps {
  /** Returns the clip, or null when speech is unavailable (route 503). Defaults to the speak route. */
  fetchAudio?: (text: string) => Promise<Blob | null>;
  createAudio?: () => AudioLike;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

export const SPEAK_ROUTE = "/api/voice/speak";

/** Default fetcher: GET /api/voice/speak?text=…; null on any non-OK response (503 when unconfigured). */
export async function fetchSpeechFromRoute(text: string, fetchImpl: typeof fetch = fetch): Promise<Blob | null> {
  try {
    const response = await fetchImpl(`${SPEAK_ROUTE}?text=${encodeURIComponent(text)}`);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

/** Generous cap on how long one line may take: reading speed plus network slack. */
export function speakSafetyMs(text: string): number {
  return (text.length / 12 + 3) * 1000;
}

interface Pending {
  finish: () => void;
}

export function createDeepgramSpeaker(deps: DeepgramSpeakerDeps = {}): Speaker {
  const fetchAudio = deps.fetchAudio ?? ((text: string) => fetchSpeechFromRoute(text));
  const createAudio =
    deps.createAudio ?? (typeof Audio !== "undefined" ? () => new Audio() as unknown as AudioLike : undefined);
  const createObjectURL = deps.createObjectURL ?? (typeof URL !== "undefined" && "createObjectURL" in URL ? (blob: Blob) => URL.createObjectURL(blob) : undefined);
  const revokeObjectURL = deps.revokeObjectURL ?? (typeof URL !== "undefined" && "revokeObjectURL" in URL ? (url: string) => URL.revokeObjectURL(url) : () => undefined);
  const setTimer = deps.setTimeoutImpl ?? setTimeout;
  const clearTimer = deps.clearTimeoutImpl ?? clearTimeout;

  let supported = Boolean(createAudio && createObjectURL);
  let element: AudioLike | null = null;
  let pending: Pending | null = null;
  const cache = new Map<string, Promise<Blob | null>>();

  function audio(): AudioLike | null {
    if (!createAudio) return null;
    if (!element) element = createAudio();
    return element;
  }

  function clip(text: string): Promise<Blob | null> {
    const key = text.trim();
    let hit = cache.get(key);
    if (!hit) {
      hit = fetchAudio(key);
      cache.set(key, hit);
      // Don't cache failures forever: a transient error should be retried on the next speak().
      void hit.then((blob) => {
        if (blob === null) cache.delete(key);
      });
    }
    return hit;
  }

  function unlock() {
    const el = audio();
    if (!el) return;
    try {
      el.src = SILENT_WAV_DATA_URI;
      const played = el.play();
      if (played && typeof (played as Promise<void>).catch === "function") (played as Promise<void>).catch(() => undefined);
    } catch {
      // Autoplay policy: the first real speak() may still be blocked; it resolves on error anyway.
    }
  }

  function prefetch(texts: string[]) {
    if (!supported) return;
    for (const text of texts) void clip(text);
  }

  async function speak(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!supported || !trimmed) return;
    const el = audio();
    if (!el || !createObjectURL) return;
    // A new line supersedes any clip still playing.
    cancel();
    const blob = await clip(trimmed);
    if (blob === null) {
      supported = false;
      return;
    }
    await new Promise<void>((resolve) => {
      const objectUrl = createObjectURL(blob);
      let done = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (done) return;
        done = true;
        if (timer !== null) clearTimer(timer);
        el.onended = null;
        el.onerror = null;
        revokeObjectURL(objectUrl);
        if (pending?.finish === finish) pending = null;
        resolve();
      };
      pending = { finish };
      el.onended = finish;
      el.onerror = finish;
      timer = setTimer(finish, speakSafetyMs(trimmed));
      try {
        el.src = objectUrl;
        el.currentTime = 0;
        const played = el.play();
        if (played && typeof (played as Promise<void>).catch === "function") (played as Promise<void>).catch(() => finish());
      } catch {
        finish();
      }
    });
  }

  function cancel() {
    try {
      element?.pause();
    } catch {
      // Nothing playing.
    }
    pending?.finish();
    pending = null;
  }

  return {
    get supported() {
      return supported;
    },
    unlock,
    speak,
    cancel,
    prefetch,
  };
}
