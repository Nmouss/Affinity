import { describe, expect, it } from "vitest";
import { ARMING_TABLE, BUNDLE_SETTLE_MS, isGestureArmed, type ArmingContext } from "@/lib/director/arming";
import type { GestureType, StagePhase } from "@/types/stage";

const PHASES: StagePhase[] = [
  "lobby",
  "convening",
  "opinions",
  "merge",
  "deliberating",
  "conflict",
  "searching",
  "bundle",
  "scoring",
  "revising",
  "awaitMandate",
  "signing",
  "preflight",
  "receipt",
  "checkout",
];

const settled = (phase: StagePhase): ArmingContext => ({
  phase,
  missionText: "Family Christmas tree, under $200",
  seatedCount: 3,
  bundleShownAt: 0,
  now: BUNDLE_SETTLE_MS,
});

const armedPhases = (type: GestureType) => PHASES.filter((phase) => isGestureArmed(type, settled(phase)));

describe("arming table", () => {
  it("covers every gesture type", () => {
    expect(Object.keys(ARMING_TABLE).sort()).toEqual(
      [
        "convene",
        "dragEnd",
        "dragStart",
        "handshakeComplete",
        "handshakeProgress",
        "hover",
        "orbit",
        "pinchTap",
        "reject",
        "reset",
        "retry",
        "seat",
        "swipe",
        "toggleReasoning",
      ].sort(),
    );
  });

  it("arms each gesture in exactly the right phases", () => {
    expect(armedPhases("hover")).toEqual(PHASES);
    expect(armedPhases("toggleReasoning")).toEqual(PHASES);
    expect(armedPhases("reset")).toEqual(PHASES);
    expect(armedPhases("pinchTap")).toEqual(PHASES.filter((phase) => phase !== "signing"));
    for (const type of ["dragStart", "dragEnd", "seat", "convene"] as const) expect(armedPhases(type)).toEqual(["lobby"]);
    expect(armedPhases("orbit")).toEqual(["bundle", "scoring", "awaitMandate"]);
    for (const type of ["swipe", "reject", "handshakeProgress", "handshakeComplete"] as const) {
      expect(armedPhases(type)).toEqual(["awaitMandate"]);
    }
    expect(armedPhases("retry")).toEqual(PHASES.filter((phase) => phase !== "lobby" && phase !== "checkout"));
  });

  it("only convenes with mission text and a seated sprite", () => {
    expect(isGestureArmed("convene", { ...settled("lobby"), seatedCount: 0 })).toBe(false);
    expect(isGestureArmed("convene", { ...settled("lobby"), missionText: "   " })).toBe(false);
    expect(isGestureArmed("convene", { ...settled("lobby"), seatedCount: 1 })).toBe(true);
  });

  it("holds the handshake until the bundle has been on screen for 2 s", () => {
    const context = { ...settled("awaitMandate"), bundleShownAt: 10_000 };
    expect(isGestureArmed("handshakeComplete", { ...context, now: 11_999 })).toBe(false);
    expect(isGestureArmed("handshakeComplete", { ...context, now: 12_000 })).toBe(true);
    expect(isGestureArmed("handshakeProgress", { ...context, now: 11_000 })).toBe(false);
    expect(isGestureArmed("swipe", { ...context, bundleShownAt: null })).toBe(false);
  });
});
