import { describe, expect, it } from "vitest";
import { COOL_SCORE, STRONG_SCORE, supportersFor, supportLevel, supportSentence } from "@/components/hud/supporters";
import type { SpriteScore } from "@/types/domain";

const names: Record<string, string> = { wife: "Maya", daughter: "Ava", son: "Leo" };
const nameOf = (id: string) => names[id] ?? id;
const score = (spriteId: string, value: number, say = "…"): SpriteScore => ({ spriteId, score: value, say });

describe("supportLevel", () => {
  it("is strong when the item was picked for the person, whatever their score", () => {
    expect(supportLevel(true, 2)).toBe("strong");
    expect(supportLevel(true, null)).toBe("strong");
  });

  it("follows the score thresholds otherwise", () => {
    expect(supportLevel(false, STRONG_SCORE)).toBe("strong");
    expect(supportLevel(false, COOL_SCORE)).toBe("neutral");
    expect(supportLevel(false, COOL_SCORE - 0.1)).toBe("cool");
    expect(supportLevel(false, null)).toBe("unknown");
  });
});

describe("supportersFor", () => {
  it("orders strongest first and keeps participant order within a level", () => {
    const supporters = supportersFor(
      "item-1",
      ["son", "wife", "daughter"],
      { daughter: ["item-1"] },
      { son: score("son", 5), wife: score("wife", 8, "Lovely.") },
    );
    expect(supporters.map((s) => [s.id, s.level])).toEqual([
      ["wife", "strong"],
      ["daughter", "strong"],
      ["son", "cool"],
    ]);
    expect(supporters[0]).toMatchObject({ serves: false, score: 8, say: "Lovely." });
    expect(supporters[1]).toMatchObject({ serves: true, score: null, say: null });
  });

  it("ignores serves entries for other items", () => {
    const [only] = supportersFor("item-2", ["wife"], { wife: ["item-1"] }, {});
    expect(only).toMatchObject({ serves: false, level: "unknown" });
  });
});

describe("supportSentence", () => {
  it("says the council is still weighing in before any scores", () => {
    expect(supportSentence(supportersFor("x", ["wife", "son"], {}, {}), nameOf)).toBe("The council is still weighing in.");
  });

  it("names the backers and the unconvinced in plain words", () => {
    const supporters = supportersFor(
      "x",
      ["wife", "daughter", "son"],
      { wife: ["x"] },
      { daughter: score("daughter", 9), son: score("son", 4) },
    );
    expect(supportSentence(supporters, nameOf)).toBe("Maya and Ava are behind this pick; Leo isn't sold yet.");
  });

  it("handles a single backer, three backers, and an all-neutral room", () => {
    expect(supportSentence(supportersFor("x", ["wife"], { wife: ["x"] }, {}), nameOf)).toBe("Maya is behind this pick.");
    const three = supportersFor("x", ["wife", "daughter", "son"], {}, { wife: score("wife", 8), daughter: score("daughter", 7), son: score("son", 9) });
    expect(supportSentence(three, nameOf)).toBe("Maya, Ava, and Leo are behind this pick.");
    const neutral = supportersFor("x", ["wife"], {}, { wife: score("wife", 6.5) });
    expect(supportSentence(neutral, nameOf)).toBe("Everyone is warm on it, nobody is set on it.");
  });
});
