import { describe, expect, it } from "vitest";
import { filterPlazaKeyAction } from "@/components/hands/PlazaCouncilKeys";
import type { KeyAction } from "@/lib/gestures/keyboard";

describe("filterPlazaKeyAction", () => {
  it("passes the handshake hold through, held or released", () => {
    expect(filterPlazaKeyAction({ kind: "handshake", held: true })).toEqual({ kind: "handshake", held: true });
    expect(filterPlazaKeyAction({ kind: "handshake", held: false })).toEqual({ kind: "handshake", held: false });
  });

  it("passes an emitted convene through", () => {
    const action: KeyAction = { kind: "emit", event: { type: "convene" } };
    expect(filterPlazaKeyAction(action)).toEqual(action);
  });

  it("passes an emitted reset through", () => {
    const action: KeyAction = { kind: "emit", event: { type: "reset" } };
    expect(filterPlazaKeyAction(action)).toEqual(action);
  });

  it("ignores an emitted seat (digit keys)", () => {
    expect(filterPlazaKeyAction({ kind: "emit", event: { type: "seat", spriteId: "wife" } })).toBeNull();
  });

  it("ignores an emitted orbit (arrow keys)", () => {
    expect(filterPlazaKeyAction({ kind: "emit", event: { type: "orbit", dx: 0.06, dy: 0 } })).toBeNull();
  });

  it("ignores hover-cycle, tap, and swipe", () => {
    expect(filterPlazaKeyAction({ kind: "cycleHover", step: 1 })).toBeNull();
    expect(filterPlazaKeyAction({ kind: "cycleHover", step: -1 })).toBeNull();
    expect(filterPlazaKeyAction({ kind: "tapHover" })).toBeNull();
    expect(filterPlazaKeyAction({ kind: "swipeHover" })).toBeNull();
  });
});
