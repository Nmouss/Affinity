import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string): string | null => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string): void => void data.set(key, value),
    removeItem: (key: string): void => void data.delete(key),
    raw: data,
  };
}

const memoryStorage = createMemoryStorage();
(globalThis as unknown as { localStorage: unknown }).localStorage = memoryStorage;

const sound = await import("@/components/maker/sound");

describe("sound preference", () => {
  beforeEach(() => memoryStorage.raw.clear());
  afterEach(() => sound.setSoundEnabled(true));

  it("defaults to on, persists off, and notifies listeners", () => {
    expect(sound.isSoundEnabled()).toBe(true);
    const listener = vi.fn();
    const stop = sound.onSoundChange(listener);
    sound.setSoundEnabled(false);
    expect(listener).toHaveBeenCalledWith(false);
    expect(memoryStorage.getItem("affinity.sound.v1")).toBe("off");
    expect(sound.isSoundEnabled()).toBe(false);
    stop();
    sound.setSoundEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("plays nothing while muted (no AudioContext is ever created without a window)", () => {
    sound.setSoundEnabled(false);
    expect(() => sound.playBlip("select")).not.toThrow();
    expect(() => sound.playWhistle()).not.toThrow();
  });
});
