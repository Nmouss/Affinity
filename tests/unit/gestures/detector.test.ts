import { describe, expect, it } from "vitest";
import { createGestureMachine, type MachineContext, type MachineHand } from "@/lib/gestures/detector";
import type { GestureEvent, TargetId } from "@/types/stage";

const MAYA: [number, number] = [-0.6, 0];
const HEARTH: [number, number] = [0, 0.2];
const SEAT: [number, number] = [-0.2, -0.5];
const EMPTY: [number, number] = [0.8, 0.8];

const context: MachineContext = {
  hitTest(pointer, accept) {
    const near = (p: [number, number]) => Math.hypot(pointer[0] - p[0], pointer[1] - p[1]) < 0.1;
    const candidates: Array<[TargetId, [number, number]]> = [
      ["sprite:wife", MAYA],
      ["hearth", HEARTH],
      ["seat:0", SEAT],
      ["item:tree-4ft", [0.5, -0.5]],
    ];
    const hit = candidates.find(([id, p]) => near(p) && (!accept || accept(id)));
    return hit?.[0] ?? null;
  },
  dropSeat(pointer) {
    return Math.hypot(pointer[0] - SEAT[0], pointer[1] - SEAT[1]) < 0.1 ? 0 : null;
  },
};

const relaxed = { pinch: 0.3, grab: 0.3, rollRadians: 0, velocityX: 0 };
const pinched = { pinch: 0.95, grab: 0.2, rollRadians: 0, velocityX: 0 };
const open = { pinch: 0.1, grab: 0.05, rollRadians: 0, velocityX: 0 };
const shake = { pinch: 0.9, grab: 1, rollRadians: -Math.PI / 2, velocityX: 0 };

function harness() {
  const events: GestureEvent[] = [];
  const machine = createGestureMachine({ emit: (event) => events.push(event) });
  let t = 0;
  /** Steps at 60 fps for `ms`, with the pose (or null for no hand) and pointer given. */
  const run = (ms: number, hand: Omit<MachineHand, "pointer"> | null, pointer: [number, number], assist = false) => {
    const end = t + ms;
    let snapshot = machine.snapshot();
    while (t < end) {
      t += 1000 / 60;
      snapshot = machine.step({ t, hand: hand && { ...hand, pointer }, handshakeAssist: assist }, context);
    }
    return snapshot;
  };
  const types = () => events.map((event) => event.type);
  const of = <T extends GestureEvent["type"]>(type: T) =>
    events.filter((event): event is Extract<GestureEvent, { type: T }> => event.type === type);
  return { events, machine, run, types, of };
}

describe("hover", () => {
  it("emits only when the target under the pointer changes", () => {
    const h = harness();
    h.run(200, relaxed, EMPTY);
    h.run(200, relaxed, MAYA);
    h.run(200, relaxed, HEARTH);
    h.run(100, null, HEARTH);
    expect(h.of("hover").map((event) => event.target)).toEqual(["sprite:wife", "hearth", null]);
  });
});

describe("pinch", () => {
  it("a short pinch is a tap on the target under the pointer", () => {
    const h = harness();
    h.run(200, relaxed, HEARTH);
    h.run(200, pinched, HEARTH);
    h.run(100, relaxed, HEARTH);
    expect(h.of("pinchTap")).toEqual([{ type: "pinchTap", target: "hearth" }]);
    expect(h.types()).not.toContain("dragStart");
  });

  it("holding a sprite past 0.4 s drags it, and releasing over a seat seats it", () => {
    const h = harness();
    h.run(200, relaxed, MAYA);
    h.run(300, pinched, MAYA);
    expect(h.types()).not.toContain("dragStart");
    const held = h.run(200, pinched, MAYA);
    expect(h.of("dragStart")).toEqual([{ type: "dragStart", spriteId: "wife" }]);
    expect(held.draggingSpriteId).toBe("wife");
    h.run(300, pinched, SEAT);
    const released = h.run(100, relaxed, SEAT);
    expect(h.of("dragEnd")).toEqual([{ type: "dragEnd", spriteId: "wife", seat: 0 }]);
    expect(h.types()).not.toContain("pinchTap");
    expect(released.draggingSpriteId).toBeNull();
  });

  it("moving more than 3% of the screen starts the drag early", () => {
    const h = harness();
    h.run(200, relaxed, MAYA);
    h.run(50, pinched, MAYA);
    h.run(50, pinched, [MAYA[0] + 0.08, MAYA[1]]);
    expect(h.of("dragStart")).toHaveLength(1);
    h.run(100, relaxed, EMPTY);
    expect(h.of("dragEnd")).toEqual([{ type: "dragEnd", spriteId: "wife", seat: null }]);
  });

  it("does not hover the dragged sprite itself", () => {
    const h = harness();
    h.run(200, relaxed, MAYA);
    const snapshot = h.run(500, pinched, MAYA);
    expect(snapshot.draggingSpriteId).toBe("wife");
    expect(snapshot.hover).toBeNull();
  });

  it("fist guard: grab 0.95 with pinch 0.9 is not a pinch", () => {
    const h = harness();
    h.run(200, relaxed, HEARTH);
    const snapshot = h.run(200, { pinch: 0.9, grab: 0.95, rollRadians: 0, velocityX: 0 }, HEARTH);
    h.run(100, relaxed, HEARTH);
    expect(snapshot.pinching).toBe(false);
    expect(h.types()).not.toContain("pinchTap");
  });

  it("uses hysteresis: a dip to 0.7 does not release", () => {
    const h = harness();
    h.run(100, relaxed, HEARTH);
    h.run(100, pinched, HEARTH);
    const dipped = h.run(100, { ...pinched, pinch: 0.7 }, HEARTH);
    expect(dipped.pinching).toBe(true);
  });

  it("losing the hand mid-drag ends the drag unseated", () => {
    const h = harness();
    h.run(100, relaxed, MAYA);
    h.run(500, pinched, MAYA);
    h.run(200, pinched, SEAT);
    h.run(100, null, SEAT);
    expect(h.of("dragEnd")).toEqual([{ type: "dragEnd", spriteId: "wife", seat: null }]);
  });
});

describe("open palm", () => {
  it("orbits with pointer deltas", () => {
    const h = harness();
    h.run(50, open, [0, 0]);
    h.run(50, open, [0.2, 0.1]);
    const orbit = h.of("orbit");
    expect(orbit.length).toBeGreaterThan(0);
    const dx = orbit.reduce((sum, event) => sum + event.dx, 0);
    const dy = orbit.reduce((sum, event) => sum + event.dy, 0);
    expect(dx).toBeCloseTo(0.2);
    expect(dy).toBeCloseTo(0.1);
  });

  it("does not orbit with a relaxed (half-closed) hand", () => {
    const h = harness();
    h.run(50, relaxed, [0, 0]);
    h.run(50, relaxed, [0.2, 0.1]);
    expect(h.of("orbit")).toHaveLength(0);
  });

  it("a fast open-hand swipe over an item swipes it", () => {
    const h = harness();
    h.run(100, open, [0.5, -0.5]);
    h.run(50, { ...open, velocityX: 1400 }, [0.55, -0.5]);
    h.run(200, { ...open, velocityX: 1400 }, [0.9, -0.5]);
    expect(h.of("swipe")).toEqual([{ type: "swipe", itemId: "tree-4ft" }]);
  });
});

describe("handshake", () => {
  it("completes exactly once after 1.5 s", () => {
    const h = harness();
    h.run(1400, shake, [0, 0]);
    expect(h.types()).not.toContain("handshakeComplete");
    const done = h.run(200, shake, [0, 0]);
    expect(done.handshakeProgress).toBe(1);
    h.run(1000, shake, [0, 0]);
    expect(h.of("handshakeComplete")).toHaveLength(1);
    const progress = h.of("handshakeProgress").map((event) => event.progress);
    expect(progress.at(-1)).toBe(1);
    // Throttled: far fewer events than frames.
    expect(progress.length).toBeLessThan(60);
  });

  it("releasing at 1.0 s drains at about twice the speed without completing", () => {
    const h = harness();
    const held = h.run(1000, shake, [0, 0]);
    expect(held.handshakeProgress).toBeCloseTo(2 / 3, 1);
    const draining = h.run(250, relaxed, [0, 0]);
    expect(draining.handshakeProgress).toBeCloseTo(2 / 3 - 1 / 3, 1);
    const drained = h.run(400, relaxed, [0, 0]);
    expect(drained.handshakeProgress).toBe(0);
    expect(h.types()).not.toContain("handshakeComplete");
    expect(h.of("handshakeProgress").at(-1)?.progress).toBe(0);
  });

  it("never progresses with roll outside 60–120°", () => {
    for (const degrees of [0, 30, 55, 125, 150, 180]) {
      const h = harness();
      const snapshot = h.run(2000, { ...shake, rollRadians: (degrees * Math.PI) / 180 }, [0, 0]);
      expect(snapshot.handshakeProgress).toBe(0);
      expect(h.types()).not.toContain("handshakeProgress");
    }
  });

  it("needs a closed hand", () => {
    const h = harness();
    const snapshot = h.run(2000, { ...shake, grab: 0.6 }, [0, 0]);
    expect(snapshot.handshakeProgress).toBe(0);
  });

  it("a new hold after completing starts from empty and completes again", () => {
    const h = harness();
    h.run(1600, shake, [0, 0]);
    h.run(100, relaxed, [0, 0]);
    h.run(700, shake, [0, 0]);
    expect(h.of("handshakeComplete")).toHaveLength(1);
    h.run(900, shake, [0, 0]);
    expect(h.of("handshakeComplete")).toHaveLength(2);
  });

  it("the Space / button assist fills the same meter with no hand", () => {
    const h = harness();
    h.run(1600, null, [0, 0], true);
    expect(h.of("handshakeComplete")).toHaveLength(1);
  });
});

it("reset forgets state without emitting", () => {
  const h = harness();
  h.run(100, relaxed, MAYA);
  h.run(500, pinched, MAYA);
  const count = h.events.length;
  h.machine.reset();
  expect(h.events).toHaveLength(count);
  expect(h.machine.snapshot().draggingSpriteId).toBeNull();
});
