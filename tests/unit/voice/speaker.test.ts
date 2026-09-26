import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpeaker, type SpeechSynthesisLike, type UtteranceLike } from "@/lib/voice/speaker";
import type { VoiceLike } from "@/lib/voice/voices";

/** A fake SpeechSynthesisUtterance: records what it was given and lets the test fire its callbacks. */
class FakeUtterance implements UtteranceLike {
  text: string;
  voice: VoiceLike | null = null;
  pitch = 1;
  rate = 1;
  volume = 1;
  onend: ((event?: unknown) => void) | null = null;
  onerror: ((event?: { error?: string }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

/** A fake speechSynthesis: queues utterances and lets the test drive them to completion/error. */
function createFakeSynth(voices: VoiceLike[] = []) {
  const queue: FakeUtterance[] = [];
  let voiceschangedListener: (() => void) | null = null;
  const synth: SpeechSynthesisLike = {
    getVoices: () => voices,
    speak: (utterance) => {
      queue.push(utterance as FakeUtterance);
    },
    cancel: vi.fn(),
    resume: vi.fn(),
    addEventListener: (_type, listener) => {
      voiceschangedListener = listener;
    },
    removeEventListener: () => {
      voiceschangedListener = null;
    },
  };
  return {
    synth,
    queue,
    fireVoiceschanged: () => voiceschangedListener?.(),
  };
}

function voice(name: string): VoiceLike {
  return { name, lang: "en-US", localService: true, default: false };
}

describe("createSpeaker", () => {
  it("is unsupported (and resolves speak() immediately) when there's no injected synth and no window", async () => {
    const speaker = createSpeaker();
    expect(speaker.supported).toBe(false);
    expect(speaker.unlocked).toBe(false);
    await expect(speaker.speak("wife", "hello")).resolves.toBeUndefined();
  });

  it("resolves speak() immediately for empty text without touching the synth", async () => {
    const { synth } = createFakeSynth();
    const speakSpy = vi.spyOn(synth, "speak");
    const speaker = createSpeaker({ synth, createUtterance: (text) => new FakeUtterance(text) });
    await expect(speaker.speak("wife", "   ")).resolves.toBeUndefined();
    expect(speakSpy).not.toHaveBeenCalled();
  });

  it("resolves after the last utterance in the sentence queue ends", async () => {
    const { synth, queue } = createFakeSynth();
    const speaker = createSpeaker({ synth, createUtterance: (text) => new FakeUtterance(text) });

    let resolved = false;
    const done = speaker.speak("wife", "Hello there. How are you?").then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(queue.length).toBe(1);
    expect(resolved).toBe(false);

    queue[0].onend?.();
    await Promise.resolve();
    expect(queue.length).toBe(2);
    expect(resolved).toBe(false);

    queue[1].onend?.();
    await done;
    expect(resolved).toBe(true);
  });

  it("applies the sprite persona's voice, pitch and rate to each utterance", async () => {
    const wifeVoice = voice("Samantha");
    const { synth, queue } = createFakeSynth([wifeVoice]);
    const speaker = createSpeaker({ synth, createUtterance: (text) => new FakeUtterance(text) });

    const done = speaker.speak("wife", "Hello there.");
    await Promise.resolve();
    expect(queue[0].voice).toBe(wifeVoice);
    expect(queue[0].pitch).toBe(1.0);
    expect(queue[0].rate).toBe(0.95);

    queue[0].onend?.();
    await done;
  });

  it("resolves on an utterance error instead of continuing to the next sentence", async () => {
    const { synth, queue } = createFakeSynth();
    const speaker = createSpeaker({ synth, createUtterance: (text) => new FakeUtterance(text) });

    const done = speaker.speak("wife", "Hello there. How are you?");
    await Promise.resolve();
    expect(queue.length).toBe(1);

    queue[0].onerror?.({ error: "synthesis-failed" });
    await done;
    expect(queue.length).toBe(1); // never advanced to the second sentence
  });

  it("cancel() calls speechSynthesis.cancel() and resolves every pending speak()", async () => {
    const { synth, queue } = createFakeSynth();
    const speaker = createSpeaker({ synth, createUtterance: (text) => new FakeUtterance(text) });

    const first = speaker.speak("wife", "Hello there.");
    const second = speaker.speak("daughter", "Hi Ava.");
    await Promise.resolve();
    expect(queue.length).toBe(2);

    speaker.cancel();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });

  describe("safety timeout", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("resolves on its own if the engine never fires end or error", async () => {
      const { synth, queue } = createFakeSynth();
      const speaker = createSpeaker({ synth, createUtterance: (text) => new FakeUtterance(text) });

      let resolved = false;
      const done = speaker.speak("wife", "hi").then(() => {
        resolved = true;
      });
      await Promise.resolve();
      expect(queue.length).toBe(1);

      // safety = (text.length / 10 + 2) s; "hi" is 2 chars, so ~2.2s.
      await vi.advanceTimersByTimeAsync(2200);
      await done;
      expect(resolved).toBe(true);
    });
  });

  describe("unlock", () => {
    it("does nothing when unsupported", () => {
      const speaker = createSpeaker();
      speaker.unlock();
      expect(speaker.unlocked).toBe(false);
    });

    it("marks the speaker unlocked, and flips it back off after a not-allowed speak() error", async () => {
      const { synth, queue } = createFakeSynth();
      const speaker = createSpeaker({ synth, createUtterance: (text) => new FakeUtterance(text) });

      speaker.unlock();
      expect(speaker.unlocked).toBe(true);

      const done = speaker.speak("wife", "Hello there.");
      await Promise.resolve();
      queue[queue.length - 1].onerror?.({ error: "not-allowed" });
      await done;
      expect(speaker.unlocked).toBe(false);
    });
  });

  it("refreshes its voice cache when voiceschanged fires", async () => {
    const { synth, queue, fireVoiceschanged } = createFakeSynth([]);
    const speaker = createSpeaker({ synth, createUtterance: (text) => new FakeUtterance(text) });

    const wifeVoice = voice("Samantha");
    (synth.getVoices as unknown as () => VoiceLike[]) = () => [wifeVoice];
    fireVoiceschanged();

    const done = speaker.speak("wife", "Hello there.");
    await Promise.resolve();
    expect(queue[0].voice).toBe(wifeVoice);
    queue[0].onend?.();
    await done;
  });
});
