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

describe("scriptFor", () => {
  const known = { loves: ["gym", "technology", "hiking"], avoids: ["clutter"], personality: ["practical", "curious"] };

  it("meets a new character with the open prompt", async () => {
    const { scriptFor, QUESTIONS } = await import("@/lib/interview");
    const script = scriptFor("Ava", { loves: [], avoids: [], personality: [] });
    expect(script.knows).toBe(false);
    expect(script.question).toBe(QUESTIONS[0]);
    expect(script.intro).toContain("Nice to meet you, Ava");
  });

  it("recaps what it knows about an existing character and asks what's new", async () => {
    const { scriptFor, recapFor } = await import("@/lib/interview");
    const script = scriptFor("Maya", known);
    expect(script.knows).toBe(true);
    expect(script.intro).toBe("Let's get to know Maya a bit better.");
    expect(recapFor("Maya", known)).toBe(
      "Here's what I know about Maya so far: they love gym, technology, and hiking, they steer clear of clutter, and they come across as practical and curious.",
    );
    expect(script.question.spoken).toContain(recapFor("Maya", known));
    expect(script.question.spoken).toMatch(/anything new|got wrong/i);
    expect(script.question.spoken).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("recaps only the lists that have anything in them", async () => {
    const { recapFor } = await import("@/lib/interview");
    expect(recapFor("Leo", { loves: ["dinosaurs"], avoids: [], personality: [] })).toBe("Here's what I know about Leo so far: they love dinosaurs.");
  });
});
