import { afterEach, describe, expect, it } from "vitest";
import { hoverCycle, isTypingTarget, mapKey, nextInCycle, shouldPreventDefault } from "@/lib/gestures/keyboard";
import { useRoster } from "@/lib/people/roster";
import { BLANK_LOOK } from "@/lib/people/starters";

const stage = { tagName: "BODY" };

describe("mapKey", () => {
  it("maps the demo keys", () => {
    expect(mapKey({ code: "Digit1", target: stage }, "down")).toEqual({
      kind: "emit",
      event: { type: "seat", spriteId: "wife" },
    });
    expect(mapKey({ code: "Digit2" }, "down")).toMatchObject({ event: { spriteId: "daughter" } });
    expect(mapKey({ code: "Digit3" }, "down")).toMatchObject({ event: { spriteId: "son" } });
    expect(mapKey({ code: "Enter" }, "down")).toEqual({ kind: "emit", event: { type: "convene" } });
    expect(mapKey({ code: "KeyR" }, "down")).toEqual({ kind: "emit", event: { type: "reset" } });
    expect(mapKey({ code: "KeyP" }, "down")).toEqual({ kind: "tapHover" });
    expect(mapKey({ code: "KeyX" }, "down")).toEqual({ kind: "swipeHover" });
    expect(mapKey({ code: "Tab" }, "down")).toEqual({ kind: "cycleHover", step: 1 });
    expect(mapKey({ code: "Tab", shiftKey: true }, "down")).toEqual({ kind: "cycleHover", step: -1 });
    expect(mapKey({ code: "ArrowLeft" }, "down")).toMatchObject({ event: { type: "orbit", dy: 0 } });
    expect(mapKey({ code: "KeyQ" }, "down")).toBeNull();
  });

  it("holds the handshake on Space down and releases on Space up", () => {
    expect(mapKey({ code: "Space" }, "down")).toEqual({ kind: "handshake", held: true });
    expect(mapKey({ code: "Space" }, "up")).toEqual({ kind: "handshake", held: false });
    expect(mapKey({ code: "KeyR" }, "up")).toBeNull();
  });

  it("ignores typing in inputs, textareas, selects and contenteditable", () => {
    for (const target of [
      { tagName: "INPUT" },
      { tagName: "textarea" },
      { tagName: "SELECT" },
      { tagName: "DIV", isContentEditable: true },
    ]) {
      for (const code of ["KeyR", "KeyD", "Digit1", "Space", "Enter", "Tab", "ArrowLeft", "KeyP"]) {
        expect(mapKey({ code, target }, "down")).toBeNull();
      }
    }
  });

  it("still releases Space if focus moved into a field mid-hold", () => {
    expect(mapKey({ code: "Space", target: { tagName: "INPUT" } }, "up")).toEqual({ kind: "handshake", held: false });
  });

  it("ignores browser shortcuts and auto-repeat for one-shot keys", () => {
    expect(mapKey({ code: "KeyR", metaKey: true }, "down")).toBeNull();
    expect(mapKey({ code: "KeyR", ctrlKey: true }, "down")).toBeNull();
    expect(mapKey({ code: "KeyR", repeat: true }, "down")).toBeNull();
    expect(mapKey({ code: "Space", repeat: true }, "down")).toBeNull();
    expect(mapKey({ code: "ArrowRight", repeat: true }, "down")).not.toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("recognizes form fields only", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });
});

describe("hover cycling", () => {
  const cycle = hoverCycle(["hearth", "sprite:son", "item:b", "seat:0", "sprite:wife", "item:a", "sprite:daughter"], [
    "wife",
    "daughter",
    "son",
  ]);

  it("orders sprites by family, then items", () => {
    expect(cycle).toEqual(["sprite:wife", "sprite:daughter", "sprite:son", "item:a", "item:b"]);
  });

  it("wraps both ways", () => {
    expect(nextInCycle(cycle, null, 1)).toBe("sprite:wife");
    expect(nextInCycle(cycle, null, -1)).toBe("item:b");
    expect(nextInCycle(cycle, "item:b", 1)).toBe("sprite:wife");
    expect(nextInCycle(cycle, "sprite:wife", -1)).toBe("item:b");
    expect(nextInCycle(cycle, "hearth", 1)).toBe("sprite:wife");
    expect(nextInCycle([], null, 1)).toBeNull();
  });
});

it("prevents browser defaults only for stage keys", () => {
  expect(shouldPreventDefault("Tab")).toBe(true);
  expect(shouldPreventDefault("Space")).toBe(true);
  expect(shouldPreventDefault("ArrowUp")).toBe(true);
  expect(shouldPreventDefault("KeyR")).toBe(false);
});

describe("number keys across both circles", () => {
  afterEach(() => useRoster.getState().resetToStarters());

  it("seat the starters (all family) in roster order by default", () => {
    expect(mapKey({ code: "Digit1" }, "down")).toEqual({ kind: "emit", event: { type: "seat", spriteId: "wife" } });
    expect(mapKey({ code: "Digit2" }, "down")).toEqual({ kind: "emit", event: { type: "seat", spriteId: "daughter" } });
    expect(mapKey({ code: "Digit3" }, "down")).toEqual({ kind: "emit", event: { type: "seat", spriteId: "son" } });
    expect(mapKey({ code: "Digit4" }, "down")).toBeNull();
  });

  it("seats family first, then friends, once a friend joins the roster", () => {
    const friendId = useRoster.getState().addPerson({
      name: "Friend",
      circle: "friend",
      relationship: "friend",
      look: BLANK_LOOK,
    });
    expect(mapKey({ code: "Digit1" }, "down")).toEqual({ kind: "emit", event: { type: "seat", spriteId: "wife" } });
    expect(mapKey({ code: "Digit2" }, "down")).toEqual({ kind: "emit", event: { type: "seat", spriteId: "daughter" } });
    expect(mapKey({ code: "Digit3" }, "down")).toEqual({ kind: "emit", event: { type: "seat", spriteId: "son" } });
    // The friend comes after all three family starters, even though they were added most recently.
    expect(mapKey({ code: "Digit4" }, "down")).toEqual({ kind: "emit", event: { type: "seat", spriteId: friendId } });
    expect(mapKey({ code: "Numpad4" }, "down")).toEqual({ kind: "emit", event: { type: "seat", spriteId: friendId } });
  });

  it("a new family member still seats before an existing friend", () => {
    const friendId = useRoster.getState().addPerson({
      name: "Friend",
      circle: "friend",
      relationship: "friend",
      look: BLANK_LOOK,
    });
    const familyId = useRoster.getState().addPerson({
      name: "New Kid",
      circle: "family",
      relationship: "kid",
      look: BLANK_LOOK,
    });
    expect(mapKey({ code: "Digit4" }, "down")).toEqual({ kind: "emit", event: { type: "seat", spriteId: familyId } });
    expect(mapKey({ code: "Digit5" }, "down")).toEqual({ kind: "emit", event: { type: "seat", spriteId: friendId } });
  });
});
