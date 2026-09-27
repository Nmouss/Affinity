import { describe, expect, it } from "vitest";
import {
  formationForPicks,
  giftPickBack,
  giftPickNext,
  giftPickPrompt,
  giftRoleOf,
  invitedForPicks,
  personForKey,
  pickGiftPerson,
  PICK_STAGE,
  startGiftPick,
} from "@/components/maker/plaza/giftPick";

const ids = ["wife", "daughter", "son", "p-1"];
const names = { wife: "Maya", daughter: "Ava", son: "Leo", "p-1": "Sam" };

describe("gift pick flow", () => {
  it("picks exactly one recipient, then toggles buyers who are never the recipient", () => {
    let state = startGiftPick();
    expect(giftPickNext(state)).toBe(state); // no recipient yet
    state = pickGiftPerson(state, "daughter");
    state = pickGiftPerson(state, "wife");
    expect(state.recipientId).toBe("wife");
    state = giftPickNext(state);
    expect(state.step).toBe("buyers");
    state = pickGiftPerson(state, "wife");
    expect(state.buyerIds).toEqual([]);
    state = pickGiftPerson(state, "son");
    state = pickGiftPerson(state, "daughter");
    state = pickGiftPerson(state, "son");
    expect(state.buyerIds).toEqual(["daughter"]);
    expect(invitedForPicks(state)).toEqual(["wife", "daughter"]);
    expect(giftRoleOf(state, "wife")).toBe("recipient");
    expect(giftRoleOf(state, "daughter")).toBe("buyer");
    expect(giftRoleOf(state, "son")).toBeNull();
  });

  it("prefills buyers from the mission circle and drops the recipient from them", () => {
    let state = startGiftPick(["son", "wife", "son"]);
    expect(state.buyerIds).toEqual(["son", "wife"]);
    state = pickGiftPerson(state, "wife");
    expect(state.buyerIds).toEqual(["son"]);
    expect(invitedForPicks(state)).toEqual(["wife", "son"]);
  });

  it("goes back one step and leaves picking from the first step", () => {
    const state = giftPickNext(pickGiftPerson(startGiftPick(), "son"));
    expect(giftPickBack(state)?.step).toBe("recipient");
    expect(giftPickBack(startGiftPick())).toBeNull();
  });

  it("maps number keys to roster order", () => {
    expect(personForKey("1", ids)).toBe("wife");
    expect(personForKey("4", ids)).toBe("p-1");
    expect(personForKey("5", ids)).toBeNull();
    expect(personForKey("a", ids)).toBeNull();
    expect(personForKey("0", ids)).toBeNull();
  });

  it("lines the recipient up front, buyers beside them, everyone else at the back without overlap", () => {
    const slots = formationForPicks(ids, { recipientId: "wife", buyerIds: ["son", "daughter"] });
    expect(slots.wife).toEqual([0, PICK_STAGE.frontZ]);
    expect(slots.son![0]).toBeGreaterThan(0);
    expect(slots.daughter![0]).toBeLessThan(0);
    expect(slots["p-1"]![1]).toBeLessThan(0);
    const points = Object.values(slots);
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        expect(Math.hypot(points[i]![0] - points[j]![0], points[i]![1] - points[j]![1])).toBeGreaterThan(1.2);
      }
    }
    expect(Object.keys(slots).sort()).toEqual([...ids].sort());
  });

  it("writes plain-language prompts for each step", () => {
    expect(giftPickPrompt(startGiftPick(), names).title).toMatch(/Who is the gift for/);
    const withRecipient = pickGiftPerson(startGiftPick(), "daughter");
    expect(giftPickPrompt(withRecipient, names).title).toBe("The gift is for Ava");
    const buyers = pickGiftPerson(pickGiftPerson(giftPickNext(withRecipient), "wife"), "son");
    expect(giftPickPrompt(buyers, names).title).toBe("Maya, Leo are buying");
    expect(giftPickPrompt(giftPickNext(withRecipient), names).title).toMatch(/Who's buying/);
  });
});
