import { describe, expect, it } from "vitest";
import { hoverCycle, isTypingTarget, mapKey, nextInCycle, shouldPreventDefault } from "@/lib/gestures/keyboard";

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
    expect(mapKey({ code: "KeyD" }, "down")).toEqual({ kind: "emit", event: { type: "toggleReasoning" } });
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
