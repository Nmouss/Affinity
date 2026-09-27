import { describe, expect, it } from "vitest";
import { keyAction, TASTE_KEYS } from "@/components/maker/useMakerKeyboard";
import { confidenceSentence } from "@/components/maker/MeetPanel";
import { CHOICE_HOLD_MS } from "@/components/maker/TastePanel";
import { applyChoice, emptyProfile, TASTE_COMPARISONS } from "@/lib/taste";

describe("taste keyboard map", () => {
  it("maps arrows, N, S, U/Backspace, and Enter in the taste step only", () => {
    expect(keyAction("taste", "ArrowLeft")).toEqual({ type: "tasteChoice", choice: "left" });
    expect(keyAction("taste", "ArrowRight")).toEqual({ type: "tasteChoice", choice: "right" });
    expect(keyAction("taste", "n")).toEqual({ type: "tasteChoice", choice: "neither" });
    expect(keyAction("taste", "S")).toEqual({ type: "tasteChoice", choice: "skip" });
    expect(keyAction("taste", "Backspace")).toEqual({ type: "tasteUndo" });
    expect(keyAction("taste", "u")).toEqual({ type: "tasteUndo" });
    expect(keyAction("taste", "Enter")).toEqual({ type: "tasteDone" });
    expect(keyAction("taste", "a")).toBeNull();
    expect(keyAction("meet", "Enter")).toEqual({ type: "meetDone" });
    expect(keyAction("meet", "ArrowLeft")).toBeNull();
    expect(keyAction("editor", "ArrowLeft")).toBeNull();
    expect(keyAction("plaza", "Enter")).toBeNull();
  });

  it("never binds letters the editor's name field needs without the step guard", () => {
    for (const key of Object.keys(TASTE_KEYS)) expect(keyAction("editor", key)).toBeNull();
  });
});

describe("meet wording", () => {
  it("speaks in tiers, never numbers", () => {
    expect(confidenceSentence("Ava", undefined)).toMatch(/not learned/);
    let profile = emptyProfile("2026-01-01T00:00:00Z");
    profile = applyChoice(profile, TASTE_COMPARISONS[0]!, "left", "2026-01-01T00:00:01Z");
    const sentence = confidenceSentence("Ava", profile);
    expect(sentence).toMatch(/hunch|feel|sure/);
    expect(sentence).not.toMatch(/\d/);
  });

  it("holds the picked tile long enough to read but under a second", () => {
    expect(CHOICE_HOLD_MS).toBeGreaterThanOrEqual(250);
    expect(CHOICE_HOLD_MS).toBeLessThan(1000);
  });
});
