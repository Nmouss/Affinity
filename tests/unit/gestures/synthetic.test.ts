import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Object3D, PerspectiveCamera } from "three";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createStageHitContext } from "@/components/hands/projection";
import { createGestureMachine } from "@/lib/gestures/detector";
import { parseLeapFrame } from "@/lib/gestures/leap";
import { createPointerFilter } from "@/lib/gestures/pointer";
import { CAMERA, HEARTH, SPRITE_FLOAT_HEIGHT, homePosition, seatPosition, type Vec3 } from "@/lib/stage/layout";
import { registerTarget } from "@/lib/stage/targets";
import type { GestureEvent, TargetId } from "@/types/stage";

// Plays the synthetic fixture through the real parse → filter → hit-test → machine path against the
// /lab placeholder targets, and checks it performs the scripted demo gestures.

const fixture = fileURLToPath(new URL("../../../scripts/leap/fixtures/synthetic-session.jsonl", import.meta.url));
const unregister: Array<() => void> = [];

function place(id: TargetId, [x, y, z]: Vec3, radius: number) {
  const object = new Object3D();
  object.position.set(x, y, z);
  object.updateMatrixWorld();
  unregister.push(registerTarget(id, object, radius));
}

beforeAll(() => {
  for (const id of ["wife", "daughter", "son"]) {
    const [x, , z] = homePosition(id);
    place(`sprite:${id}`, [x, SPRITE_FLOAT_HEIGHT, z], 0.9);
  }
  [0, 1, 2].forEach((seat) => place(`seat:${seat}`, seatPosition(seat), 1));
  place("hearth", [HEARTH.position[0], 1.5, HEARTH.position[2]], 1.8);
});

afterAll(() => unregister.forEach((off) => off()));

it("the synthetic session taps Maya, seats her, taps the hearth, orbits and shakes hands", () => {
  const aspect = 16 / 9;
  const camera = new PerspectiveCamera(CAMERA.fov, aspect, 0.1, 200);
  camera.position.set(...CAMERA.position);
  camera.lookAt(...CAMERA.target);
  camera.updateMatrixWorld();

  const events: GestureEvent[] = [];
  const machine = createGestureMachine({ emit: (event) => events.push(event) });
  const context = createStageHitContext(camera);
  const filter = createPointerFilter();

  for (const line of readFileSync(fixture, "utf8").split("\n")) {
    if (!line) continue;
    const frame = parseLeapFrame(JSON.parse(line));
    if (!frame) continue;
    const hand = frame.hand;
    context.beginFrame(aspect);
    machine.step(
      {
        t: frame.timestamp,
        hand: hand && {
          pointer: filter.update(hand.palm, frame.timestamp),
          pinch: hand.pinchStrength,
          grab: hand.grabStrength,
          rollRadians: hand.rollRadians,
          velocityX: hand.velocity[0],
        },
      },
      context,
    );
  }

  const semantic = events.filter((event) => ["pinchTap", "dragStart", "dragEnd", "handshakeComplete"].includes(event.type));
  expect(semantic).toEqual([
    { type: "pinchTap", target: "sprite:wife" },
    { type: "dragStart", spriteId: "wife" },
    { type: "dragEnd", spriteId: "wife", seat: 0 },
    { type: "pinchTap", target: "hearth" },
    { type: "handshakeComplete" },
  ]);
  expect(events.some((event) => event.type === "orbit")).toBe(true);
  expect(events.filter((event) => event.type === "hover").map((event) => event.target)).toContain("sprite:wife");
});
