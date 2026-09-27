import { describe, expect, it } from "vitest";
import {
  defaultQuery,
  formationForPicks,
  giftFlowReducer,
  initialGiftFlow,
  missionFromFlow,
  personForKey,
  roleOf,
  type GiftFlowState,
} from "@/components/home/giftFlow";

function run(...actions: Parameters<typeof giftFlowReducer>[1][]): GiftFlowState {
  return actions.reduce(giftFlowReducer, initialGiftFlow);
}

describe("giftFlowReducer", () => {
  it("starts the gift flow from home and picks exactly one recipient", () => {
    const state = run({ type: "startGift" }, { type: "pickPerson", id: "wife" }, { type: "pickPerson", id: "daughter" });
    expect(state.step).toBe("recipient");
    expect(state.recipientId).toBe("daughter");
    expect(state.advisorIds).toEqual([]);
  });

  it("does not advance past the recipient step without a recipient", () => {
    expect(run({ type: "startGift" }, { type: "next" }).step).toBe("recipient");
    expect(run({ type: "startGift" }, { type: "pickPerson", id: "son" }, { type: "next" }).step).toBe("advisors");
  });

  it("toggles advisors and never lets the recipient advise", () => {
    const base = run({ type: "startGift" }, { type: "pickPerson", id: "daughter" }, { type: "next" });
    const added = giftFlowReducer(giftFlowReducer(base, { type: "pickPerson", id: "wife" }), { type: "pickPerson", id: "son" });
    expect(added.advisorIds).toEqual(["wife", "son"]);
    expect(giftFlowReducer(added, { type: "pickPerson", id: "wife" }).advisorIds).toEqual(["son"]);
    expect(giftFlowReducer(added, { type: "pickPerson", id: "daughter" })).toBe(added);
    expect(roleOf(added, "daughter")).toBe("recipient");
    expect(roleOf(added, "son")).toBe("advisor");
    expect(roleOf(added, "ghost")).toBeNull();
  });

  it("re-picking the recipient removes them from the advisors", () => {
    const state = run(
      { type: "startGift" },
      { type: "pickPerson", id: "daughter" },
      { type: "next" },
      { type: "pickPerson", id: "wife" },
      { type: "back" },
      { type: "pickPerson", id: "wife" },
    );
    expect(state.recipientId).toBe("wife");
    expect(state.advisorIds).toEqual([]);
  });

  it("walks back step by step and home resets the picks but keeps the budget", () => {
    const details = run({ type: "startGift" }, { type: "pickPerson", id: "son" }, { type: "next" }, { type: "next" }, { type: "setBudget", budget: 80 });
    expect(details.step).toBe("details");
    const advisors = giftFlowReducer(details, { type: "back" });
    expect(advisors.step).toBe("advisors");
    const recipient = giftFlowReducer(advisors, { type: "back" });
    expect(recipient.step).toBe("recipient");
    const home = giftFlowReducer(recipient, { type: "back" });
    expect(home).toEqual({ ...initialGiftFlow, budget: 80 });
    expect(giftFlowReducer(details, { type: "home" }).step).toBe("home");
  });

  it("ignores a nonsense budget and keeps the last good one", () => {
    const state = run({ type: "setBudget", budget: 45 }, { type: "setBudget", budget: Number.NaN });
    expect(state.budget).toBe(45);
    expect(giftFlowReducer(state, { type: "setBudget", budget: -3 }).budget).toBe(0);
  });
});

describe("personForKey", () => {
  it("maps 1..9 onto roster order and nothing else", () => {
    const ids = ["wife", "daughter", "son"];
    expect(personForKey("1", ids)).toBe("wife");
    expect(personForKey("3", ids)).toBe("son");
    expect(personForKey("4", ids)).toBeNull();
    expect(personForKey("0", ids)).toBeNull();
    expect(personForKey("a", ids)).toBeNull();
  });
});

describe("missionFromFlow", () => {
  const picked = run(
    { type: "startGift" },
    { type: "pickPerson", id: "daughter" },
    { type: "next" },
    { type: "pickPerson", id: "wife" },
    { type: "pickPerson", id: "son" },
    { type: "next" },
  );

  it("keeps the recipient and advisors distinct and defaults the query from taste", () => {
    const mission = missionFromFlow(picked, "Ava", "casual, colorful");
    expect(mission).toMatchObject({
      type: "gift",
      recipientId: "daughter",
      invitedSpriteIds: ["daughter", "wife", "son"],
      budget: 60,
      occasion: "Christmas",
    });
    expect(mission?.shoppingSlots?.[0]?.query).toBe("something casual, colorful for Ava");
  });

  it("uses the typed query and note when given", () => {
    const state = giftFlowReducer(giftFlowReducer(picked, { type: "setQuery", query: " a cozy scarf " }), { type: "setNote", note: "no wool" });
    const mission = missionFromFlow(state, "Ava");
    expect(mission?.shoppingSlots?.[0]?.query).toBe("a cozy scarf");
    expect(mission?.freeText).toBe("Christmas gift: a cozy scarf. no wool");
  });

  it("returns null without a recipient", () => {
    expect(missionFromFlow(initialGiftFlow, "Nobody")).toBeNull();
  });

  it("falls back to a friendly default when taste is unknown or still learning", () => {
    expect(defaultQuery(null, "Leo")).toBe("a thoughtful Christmas gift for Leo");
    expect(defaultQuery("still learning", "Leo")).toBe("a thoughtful Christmas gift for Leo");
  });
});

describe("formationForPicks", () => {
  it("puts the recipient front and center, advisors beside them, everyone else at the back", () => {
    const slots = formationForPicks(["wife", "daughter", "son", "friend"], "daughter", ["wife", "son"]);
    expect(slots.daughter).toEqual([0, 1.8]);
    expect(slots.wife![1]).toBe(1.4);
    expect(slots.son![1]).toBe(1.4);
    expect(Math.sign(slots.wife![0])).toBe(-Math.sign(slots.son![0]));
    expect(slots.friend![1]).toBeLessThan(0);
    expect(Object.keys(slots)).toHaveLength(4);
  });

  it("steps the whole line-up back for the details panel", () => {
    const front = formationForPicks(["a", "b"], "a", ["b"]);
    const back = formationForPicks(["a", "b"], "a", ["b"], 2.4);
    expect(back.a![1]).toBeCloseTo(front.a![1] - 2.4);
    expect(back.b![1]).toBeCloseTo(front.b![1] - 2.4);
    expect(back.a![0]).toBe(front.a![0]);
  });

  it("gives everyone a slot even before anyone is picked, and never overlaps the front", () => {
    const slots = formationForPicks(["a", "b", "c"], null, []);
    for (const [, z] of Object.values(slots)) expect(z).toBeLessThan(0);
    const xs = Object.values(slots).map(([x]) => x);
    expect(new Set(xs).size).toBe(3);
  });
});
