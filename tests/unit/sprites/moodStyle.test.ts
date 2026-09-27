import { describe, expect, it } from "vitest";
import { SPRITE_MOODS, applyOverlays, moodStyle, resolveMood, type MoodInput } from "@/components/sprites/moodStyle";
import type { ConflictAttribution, SpriteMood } from "@/types/stage";

const idle = moodStyle("idle");
const conflict: ConflictAttribution = {
  wishBy: "son",
  ruleBy: "wife",
  itemId: "inflatable-trex",
  resolvedItemId: "orn-dino",
};

describe("moodStyle", () => {
  it("covers every SpriteMood with sane numbers", () => {
    const all: Record<SpriteMood, true> = {
      idle: true,
      hovered: true,
      held: true,
      seated: true,
      thinking: true,
      speaking: true,
      listening: true,
      vetoing: true,
      conceding: true,
      scoring: true,
      happy: true,
      sad: true,
      celebrating: true,
    };
    expect([...SPRITE_MOODS].sort()).toEqual(Object.keys(all).sort());

    for (const mood of SPRITE_MOODS) {
      const style = moodStyle(mood);
      for (const [key, value] of Object.entries(style)) {
        if (typeof value === "number") expect(Number.isFinite(value), `${mood}.${key}`).toBe(true);
      }
      expect(style.scale).toBeGreaterThan(0.8);
      expect(style.scale).toBeLessThanOrEqual(1.25);
      expect(style.aura).toBeGreaterThanOrEqual(0);
      expect(style.aura).toBeLessThanOrEqual(1);
    }
  });

  it.each<[SpriteMood, (style: ReturnType<typeof moodStyle>) => void]>([
    ["idle", (s) => expect(s.facing).toBe("camera")],
    ["hovered", (s) => (expect(s.scale).toBeCloseTo(1.1), expect(s.facing).toBe("camera"))],
    ["held", (s) => (expect(s.scale).toBeCloseTo(1.2), expect(s.trail).toBe(true))],
    ["seated", (s) => expect(s.facing).toBe("hearth")],
    ["listening", (s) => expect(s.facing).toBe("hearth")],
    ["thinking", (s) => expect(s.orbitSpeed).toBeGreaterThan(idle.orbitSpeed * 2)],
    ["vetoing", (s) => (expect(s.rimFlash).toBe(1), expect(s.facing).toBe("item"))],
    ["conceding", (s) => (expect(s.scale).toBeLessThan(idle.scale), expect(s.facing).toBe("hearth"))],
    ["scoring", (s) => expect(s.facing).toBe("hearth")],
    ["happy", (s) => expect(s.scale).toBeGreaterThan(idle.scale)],
    ["sad", (s) => expect(s.scale).toBeLessThan(idle.scale)],
    ["celebrating", (s) => (expect(s.sparkles).toBe(true), expect(s.orbitSpeed).toBeGreaterThan(idle.orbitSpeed))],
  ])("%s", (mood, check) => check(moodStyle(mood)));

  it("only celebrating sparkles and only held trails", () => {
    for (const mood of SPRITE_MOODS) {
      expect(moodStyle(mood).sparkles).toBe(mood === "celebrating");
      expect(moodStyle(mood).trail).toBe(mood === "held");
    }
  });
});

describe("applyOverlays", () => {
  it("scales hovered sprites by 1.1 and held sprites by 1.2 on top of their mood", () => {
    const happy = moodStyle("happy");
    expect(applyOverlays(happy, { hovered: true, held: false }).scale).toBeCloseTo(happy.scale * 1.1);
    expect(applyOverlays(happy, { hovered: false, held: true }).scale).toBeCloseTo(happy.scale * 1.2);
  });

  it("held wins over hovered, faces the camera, and turns on the trail", () => {
    const style = applyOverlays(moodStyle("seated"), { hovered: true, held: true });
    expect(style.trail).toBe(true);
    expect(style.facing).toBe("camera");
  });

  it("leaves the mood untouched without overlays and never mutates the table", () => {
    const before = { ...moodStyle("thinking") };
    const out = applyOverlays(moodStyle("thinking"), { hovered: false, held: false });
    expect(out).toEqual(before);
    applyOverlays(moodStyle("thinking"), { hovered: true, held: true }, out);
    expect(moodStyle("thinking")).toEqual(before);
  });
});

describe("resolveMood", () => {
  const base: MoodInput = { id: "son", mood: "seated", phase: "opinions", conflict: null, typing: false };

  it("passes the stored mood through", () => {
    expect(resolveMood(base)).toBe("seated");
  });

  it("has the rule owner veto and the wisher concede during the conflict", () => {
    expect(resolveMood({ ...base, id: "wife", phase: "conflict", conflict })).toBe("vetoing");
    expect(resolveMood({ ...base, id: "son", phase: "conflict", conflict })).toBe("conceding");
    expect(resolveMood({ ...base, id: "daughter", phase: "conflict", conflict })).toBe("seated");
  });

  it("drops the conflict moods once the bundle arrives", () => {
    expect(resolveMood({ ...base, id: "son", mood: "listening", phase: "bundle", conflict })).toBe("listening");
  });

  it("speaks only while the bubble is typing", () => {
    expect(resolveMood({ ...base, mood: "speaking", typing: true })).toBe("speaking");
    expect(resolveMood({ ...base, mood: "speaking", typing: false })).toBe("listening");
  });

  it("celebrates on the receipt", () => {
    expect(resolveMood({ ...base, mood: "sad", phase: "receipt" })).toBe("celebrating");
  });
});
