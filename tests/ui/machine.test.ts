import { describe, expect, it } from "vitest";
import {
  canTransition,
  handlingFor,
  initialState,
  reducer,
  SCREENS,
  type Screen,
  TRANSITIONS,
} from "@/lib/mission/state/machine";
import type { VoiceIntent } from "@/lib/mission/services/contracts";

function intent(
  name: VoiceIntent["intent"],
  entities: VoiceIntent["entities"] = {},
  requiresConfirmation = false,
): VoiceIntent {
  return { transcript: "hello", intent: name, entities, requiresConfirmation };
}

describe("reducer / GO", () => {
  it("1. a blocked transition leaves state unchanged (same reference, not a copy)", () => {
    // HOME cannot jump straight to COMPLETE.
    expect(canTransition("HOME", "COMPLETE")).toBe(false);
    const result = reducer(initialState, { type: "GO", screen: "COMPLETE" });
    expect(result).toBe(initialState);
  });

  it("2. an allowed transition changes only the screen (and clears error/busy)", () => {
    const withBusyAndError = { ...initialState, busy: "Loading", error: "oops" };
    const result = reducer(withBusyAndError, { type: "GO", screen: "MISSION_BRIEF" });
    expect(result.screen).toBe("MISSION_BRIEF");
    expect(result.error).toBeNull();
    expect(result.busy).toBeNull();
  });

  it("3. blocked transitions are rejected from every screen whose TRANSITIONS list excludes the target", () => {
    for (const from of SCREENS) {
      for (const to of SCREENS) {
        if (TRANSITIONS[from].includes(to)) continue;
        const result = reducer({ ...initialState, screen: from }, { type: "GO", screen: to });
        expect(result.screen).toBe(from);
      }
    }
  });
});

describe("TRANSITIONS reachability", () => {
  it("4. every screen in SCREENS is reachable from HOME by following TRANSITIONS", () => {
    const seen = new Set<Screen>(["HOME"]);
    const queue: Screen[] = ["HOME"];
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of TRANSITIONS[current]) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    for (const screen of SCREENS) {
      expect(seen.has(screen)).toBe(true);
    }
  });
});

describe("handlingFor", () => {
  it("5. approve_action always requires confirmation, even without requiresConfirmation set", () => {
    expect(handlingFor(intent("approve_action", { scope: "group" }, false))).toBe("confirm_always");
  });

  it("6. a proposed rule requires confirmation regardless of intent name", () => {
    expect(handlingFor(intent("filter_products", { proposedRule: "no_fragile_glass" }))).toBe("confirm");
  });

  it("7. a mission-field change requires confirmation via missionField", () => {
    expect(handlingFor(intent("filter_products", { missionField: "sharedBudget", value: 350 }, true))).toBe(
      "confirm",
    );
  });

  it("8. modify_cart without confirmation flags is undo-able, not immediate", () => {
    expect(handlingFor(intent("modify_cart", { operation: "add" }))).toBe("undo");
  });

  it("9. navigate_category with no confirmation flags is immediate", () => {
    expect(handlingFor(intent("navigate_category", { category: "cooking" }))).toBe("immediate");
  });

  it("10. explain_decision with no confirmation flags is immediate", () => {
    expect(handlingFor(intent("explain_decision", { shopperId: "maya" }))).toBe("immediate");
  });
});
