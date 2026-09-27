import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeepgramSpeaker, fetchSpeechFromRoute, speakSafetyMs, type AudioLike } from "@/lib/voice/deepgramSpeaker";
import { SILENT_WAV_DATA_URI } from "@/lib/voice/silentAudio";

class FakeAudio implements AudioLike {
  src = "";
  currentTime = 0;
  plays: string[] = [];
  paused = 0;
  onended: ((event?: unknown) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  play() {
    this.plays.push(this.src);
    return Promise.resolve();
  }
  pause() {
    this.paused += 1;
  }
}

function setup(fetchAudio = vi.fn(async (): Promise<Blob | null> => ({ size: 3 }) as Blob)) {
  const audio = new FakeAudio();
  const revoke = vi.fn();
  const speaker = createDeepgramSpeaker({
    fetchAudio,
    createAudio: () => audio,
    createObjectURL: () => "blob:clip",
    revokeObjectURL: revoke,
  });
  return { speaker, audio, fetchAudio, revoke };
}

async function settle() {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("silent unlock", () => {
  it("plays the silent WAV on the shared element inside the user's gesture", () => {
    const { speaker, audio } = setup();
    speaker.unlock();
    expect(audio.plays).toEqual([SILENT_WAV_DATA_URI]);
    expect(SILENT_WAV_DATA_URI.startsWith("data:audio/wav;base64,UklGR")).toBe(true); // "RIFF"
  });
});

describe("createDeepgramSpeaker", () => {
  it("resolves when the clip ends and revokes the object URL", async () => {
    const { speaker, audio, revoke } = setup();
    let resolved = false;
    const done = speaker.speak("What did you get up to last weekend?").then(() => {
      resolved = true;
    });
    await settle();
    expect(audio.plays).toEqual(["blob:clip"]);
    expect(resolved).toBe(false);
    audio.onended?.();
    await done;
    expect(resolved).toBe(true);
    expect(revoke).toHaveBeenCalledWith("blob:clip");
  });

  it("cancel() pauses and resolves the pending line", async () => {
    const { speaker, audio } = setup();
    const done = speaker.speak("Hello there.");
    await settle();
    speaker.cancel();
    await done;
    expect(audio.paused).toBeGreaterThan(0);
  });

  it("resolves at once and reports unsupported when the route has no voice", async () => {
    const { speaker } = setup(vi.fn(async () => null));
    expect(speaker.supported).toBe(true);
    await speaker.speak("Hello");
    expect(speaker.supported).toBe(false);
  });

  it("gives up after the safety timeout if the element never fires ended", async () => {
    const { speaker } = setup();
    const text = "A line that never ends.";
    let resolved = false;
    const done = speaker.speak(text).then(() => {
      resolved = true;
    });
    await settle();
    vi.advanceTimersByTime(speakSafetyMs(text) - 1);
    await settle();
    expect(resolved).toBe(false);
    vi.advanceTimersByTime(1);
    await done;
    expect(resolved).toBe(true);
  });

  it("prefetch warms the cache so speak() does not fetch again", async () => {
    const { speaker, fetchAudio, audio } = setup();
    speaker.prefetch?.(["One.", "Two."]);
    await settle();
    expect(fetchAudio).toHaveBeenCalledTimes(2);
    const done = speaker.speak("One.");
    await settle();
    expect(fetchAudio).toHaveBeenCalledTimes(2);
    audio.onended?.();
    await done;
  });

  it("does nothing for empty text", async () => {
    const { speaker, fetchAudio } = setup();
    await speaker.speak("   ");
    expect(fetchAudio).not.toHaveBeenCalled();
  });
});

describe("fetchSpeechFromRoute", () => {
  it("returns null on a non-OK response and a blob otherwise", async () => {
    const ok = { ok: true, blob: async () => ({ size: 1 }) as Blob } as unknown as Response;
    const nope = { ok: false, blob: async () => ({ size: 0 }) as Blob } as unknown as Response;
    await expect(fetchSpeechFromRoute("hi", async () => nope)).resolves.toBeNull();
    await expect(fetchSpeechFromRoute("hi", async () => ok)).resolves.toEqual({ size: 1 });
    await expect(fetchSpeechFromRoute("hi", async () => Promise.reject(new Error("offline")))).resolves.toBeNull();
  });
});
