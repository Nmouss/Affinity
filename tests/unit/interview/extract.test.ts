import { describe, expect, it } from "vitest";
import {
  CAPS,
  chunkFallback,
  EMPTY_PREFERENCES,
  EMPTY_SUMMARY,
  extractLocally,
  mergeForReview,
  normalizePreferences,
  QUESTIONS,
  stripEmoji,
  summarize,
  type InterviewAnswer,
} from "@/lib/interview";

function answer(id: InterviewAnswer["questionId"], text: string): InterviewAnswer {
  return { questionId: id, question: QUESTIONS.find((question) => question.id === id)!.spoken, answer: text };
}

describe("extractLocally", () => {
  it("turns an active weekend into loves and personality", () => {
    const result = extractLocally("Ava", [answer("about", "Went hiking with friends, then cooked dinner.")]);
    expect(result.loves).toEqual(expect.arrayContaining(["hiking", "cooking"]));
    expect(result.personality).toEqual(expect.arrayContaining(["outdoorsy", "social"]));
    expect(result.source).toBe("local");
    expect(result.summary).toMatch(/^Ava is into /);
  });

  it("reads the spending question as avoids", () => {
    const result = extractLocally("Leo", [answer("about", "I would never spend money on designer handbags, honestly.")]);
    expect(result.avoids).toContain("luxury brands");
    expect(result.personality).toContain("practical");
    expect(result.loves).toEqual([]);
    expect(result.summary).toBe("Leo steers clear of luxury brands.");
  });

  it("falls back to short chunks when the lexicon has never heard of it", () => {
    const result = extractLocally("Sam", [answer("about", "mostly birdwatching and my terrarium")]);
    expect(result.loves).toEqual(["birdwatching", "terrarium"]);
    // Known hobbies land as their canonical phrase, never as a raw chunk.
    expect(extractLocally("Sam", [answer("about", "mostly pottery and my podcast")]).loves).toEqual(["podcasts", "crafts"]);
    expect(chunkFallback("mostly pottery and my knitting circle")).toEqual(["pottery", "knitting circle"]);
    expect(chunkFallback("I spent 3 hours doing nothing")).not.toContain("3 hours");
  });

  it("ignores empty answers and dedupes across questions", () => {
    const result = extractLocally("Ava", [
      answer("about", ""),
      answer("about", "Hiking, always hiking."),
      answer("about", "A trail in the mountains"),
    ]);
    expect(result.loves.filter((love) => love === "hiking")).toHaveLength(1);
    expect(result.personality.filter((trait) => trait === "outdoorsy")).toHaveLength(1);
  });

  it("caps each list and keeps first-seen order", () => {
    const prefs = normalizePreferences({
      loves: ["a", "b", "c", "d", "e", "f", "g", "A"],
      avoids: ["x", "y", "z", "w"],
      personality: ["p", "q", "r", "s"],
    });
    expect(prefs.loves).toHaveLength(CAPS.loves);
    expect(prefs.loves[0]).toBe("a");
    expect(prefs.avoids).toEqual(["x", "y", "z"]);
    expect(prefs.personality).toEqual(["p", "q", "r"]);
  });

  it("strips emoji, quotes, and trailing periods from chips", () => {
    expect(stripEmoji("hiking 🥾 trips")).toBe("hiking trips");
    const prefs = normalizePreferences({ loves: ['"Board games."', "board games"], avoids: [], personality: [] });
    expect(prefs.loves).toEqual(["board games"]);
    const result = extractLocally("Ava", [answer("about", "🎉 party with friends 🎉")]);
    for (const text of [...result.loves, ...result.personality, result.summary]) expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("summarize", () => {
  it("drops parts gracefully", () => {
    expect(summarize("Ava", { loves: ["hiking", "cooking", "books"], avoids: ["gambling"], personality: [] })).toBe(
      "Ava is into hiking, cooking and books, and steers clear of gambling.",
    );
    expect(summarize("Ava", { loves: ["hiking"], avoids: [], personality: [] })).toBe("Ava is into hiking.");
    expect(summarize("Ava", { loves: [], avoids: [], personality: ["curious", "warm"] })).toBe("Ava comes across as curious and warm.");
    expect(summarize("Ava", EMPTY_PREFERENCES)).toBe(EMPTY_SUMMARY);
  });
});

describe("mergeForReview", () => {
  it("keeps existing chips first, dedupes, and caps", () => {
    const merged = mergeForReview(
      { loves: ["gym", "technology"], avoids: ["clutter"], personality: ["practical"] },
      { loves: ["technology", "hiking"], avoids: ["luxury brands"], personality: ["outdoorsy", "practical"] },
    );
    expect(merged.loves).toEqual(["gym", "technology", "hiking"]);
    expect(merged.avoids).toEqual(["clutter", "luxury brands"]);
    expect(merged.personality).toEqual(["practical", "outdoorsy"]);
  });
});
