import { describe, expect, it } from "vitest";
import { closingFor, introFor, QUESTIONS } from "@/lib/interview";

const EMOJI = /\p{Extended_Pictographic}/u;

describe("interview script", () => {
  it("is one open prompt about the person, never about what they want", () => {
    expect(QUESTIONS).toHaveLength(1);
    expect(QUESTIONS[0]!.id).toBe("about");
    expect(QUESTIONS[0]!.spoken.toLowerCase()).toContain("about yourself");
    expect(QUESTIONS[0]!.spoken.toLowerCase()).not.toMatch(/what do you want|gift/);
  });

  it("names the person in the intro and closing, with no emoji anywhere", () => {
    expect(introFor("Ava")).toContain("Ava");
    expect(closingFor("Ava")).toContain("Ava");
    for (const text of [introFor("Ava"), closingFor("Ava"), ...QUESTIONS.flatMap((question) => [question.spoken, question.hint])]) {
      expect(text).not.toMatch(EMOJI);
    }
  });
});
