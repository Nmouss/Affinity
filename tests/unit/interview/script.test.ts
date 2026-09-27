import { describe, expect, it } from "vitest";
import { closingFor, introFor, QUESTIONS } from "@/lib/interview";

const EMOJI = /\p{Extended_Pictographic}/u;

describe("interview script", () => {
  it("asks four indirect questions with unique ids", () => {
    expect(QUESTIONS).toHaveLength(4);
    expect(new Set(QUESTIONS.map((question) => question.id)).size).toBe(4);
    for (const question of QUESTIONS) expect(question.spoken.toLowerCase()).not.toMatch(/what do you want|gift/);
  });

  it("feeds avoids only from the spending question", () => {
    expect(QUESTIONS.filter((question) => question.feeds === "avoids").map((question) => question.id)).toEqual(["never"]);
  });

  it("names the person in the intro and closing, with no emoji anywhere", () => {
    expect(introFor("Ava")).toContain("Ava");
    expect(closingFor("Ava")).toContain("Ava");
    for (const text of [introFor("Ava"), closingFor("Ava"), ...QUESTIONS.flatMap((question) => [question.spoken, question.hint])]) {
      expect(text).not.toMatch(EMOJI);
    }
  });
});
