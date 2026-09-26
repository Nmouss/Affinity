import { describe, expect, it } from "vitest";
import { accentColor } from "@/components/sprites/palette";
import { BUBBLE_MAX, TYPE_CPS, clampBubble, typedLength, typingDuration } from "@/components/sprites/typewriter";

describe("typewriter", () => {
  it("keeps short lines as-is", () => {
    expect(clampBubble("  Can we make it   pink? ")).toBe("Can we make it pink?");
  });

  it("clamps long lines at a word boundary with an ellipsis", () => {
    const line = clampBubble("word ".repeat(60));
    expect(line.length).toBeLessThanOrEqual(BUBBLE_MAX);
    expect(line.endsWith("word…")).toBe(true);
  });

  it("types at ~30 chars per second", () => {
    expect(typedLength("hello world", 0)).toBe(0);
    expect(typedLength("x".repeat(100), 1)).toBe(TYPE_CPS);
    expect(typedLength("short", 10)).toBe(5);
    expect(typingDuration("x".repeat(60))).toBeCloseTo(2);
    expect(typingDuration(null)).toBe(0);
  });
});

describe("accentColor", () => {
  it("picks the darker profile color so text stays readable", () => {
    expect(accentColor(["#fff4d6", "#c9a227"])).toBe("#c9a227");
    expect(accentColor(["#ff8fcf", "#ffe5f5"])).toBe("#ff8fcf");
  });
});
