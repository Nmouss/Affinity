"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import { Vector3 } from "three";
import { createGestureMachine } from "@/lib/gestures/detector";
import { freshFrame, handshakeAssisted, live } from "@/lib/gestures/live";
import { createPointerFilter, DEFAULT_CALIBRATION } from "@/lib/gestures/pointer";
import type { HandPose } from "@/lib/stage/slices/hand";
import { useStage } from "@/lib/stage/store";
import type { HandFrame } from "@/lib/gestures/types";
import { HandCursor } from "./HandCursor";
import { HandshakeRing } from "./HandshakeRing";
import { HoverHalo } from "./HoverHalo";
import { createStageHitContext, floorPointAt, pointerDirection } from "./projection";

// Inside the canvas: runs the gesture machine once per render on the latest Leap frame (plus the
// Space / button handshake assist), hit-tests against the targets registry, and writes the pose
// into the hand slice. The visuals below read that slice in their own useFrame.

/** Mm of hand → ft of ghost hand, drawn around the cursor. */
const GHOST_SCALE = 0.004;
const DEG = 180 / Math.PI;

type Tuple3 = [number, number, number];

function samePose(a: HandPose, patch: Partial<HandPose>): boolean {
  for (const key of Object.keys(patch) as Array<keyof HandPose>) {
    const next = patch[key];
    const current = a[key];
    if (Array.isArray(next) && Array.isArray(current)) {
      if (JSON.stringify(next) !== JSON.stringify(current)) return false;
    } else if (next !== current) {
      return false;
    }
  }
  return true;
}

export function HandLayer() {
  const camera = useThree((state) => state.camera);
  const phase = useStage((state) => state.phase);
  const controls = useControls("Hands", {
    xRange: { value: DEFAULT_CALIBRATION.xMax, min: 60, max: 300, step: 5, label: "x ± (mm)" },
    yMin: { value: DEFAULT_CALIBRATION.yMin, min: 40, max: 300, step: 5, label: "y bottom (mm)" },
    yMax: { value: DEFAULT_CALIBRATION.yMax, min: 200, max: 600, step: 5, label: "y top (mm)" },
    minCutoff: { value: 1.0, min: 0.05, max: 5, step: 0.05 },
    beta: { value: 0.02, min: 0, max: 0.2, step: 0.005 },
    cursorDistance: { value: 6, min: 2, max: 14, step: 0.5 },
    ghostHand: true,
    forceHandshakeRing: { value: false, label: "ring in any phase" },
  });

  const machine = useMemo(() => createGestureMachine(), []);
  const filter = useMemo(() => createPointerFilter(), []);
  const state = useRef({
    lastFrame: null as HandFrame | null,
    pointer: [0, 0] as [number, number],
    tracking: false,
  });
  const scratch = useMemo(() => ({ floor: new Vector3(), dir: new Vector3(), cursor: new Vector3(), tip: new Vector3() }), []);

  const context = useMemo(() => createStageHitContext(camera), [camera]);

  // Negative priority: runs before the visuals' useFrame so they draw this frame's pose.
  useFrame(({ size }) => {
    const s = state.current;
    const now = performance.now();
    if (live.resetRequested) {
      live.resetRequested = false;
      machine.reset();
      filter.reset();
    }
    filter.configure({ minCutoff: controls.minCutoff, beta: controls.beta });
    context.beginFrame(size.width / Math.max(1, size.height));

    const frame = freshFrame(now);
    const tracked = frame?.hand ?? null;
    if (tracked && frame !== s.lastFrame) {
      s.pointer = filter.update(tracked.palm, frame!.timestamp, {
        xMin: -controls.xRange,
        xMax: controls.xRange,
        yMin: controls.yMin,
        yMax: Math.max(controls.yMin + 10, controls.yMax),
      });
    }
    s.lastFrame = frame;

    const snapshot = machine.step(
      {
        t: now,
        hand: tracked && {
          pointer: s.pointer,
          pinch: tracked.pinchStrength,
          grab: tracked.grabStrength,
          rollRadians: tracked.rollRadians,
          velocityX: tracked.velocity[0],
        },
        handshakeAssist: handshakeAssisted(),
      },
      context,
    );

    const { hand, setHand } = useStage.getState();
    const patch: Partial<HandPose> = { handshakeProgress: snapshot.handshakeProgress };
    if (tracked) {
      const floor = floorPointAt(camera, s.pointer, scratch.floor);
      pointerDirection(camera, s.pointer, scratch.dir);
      scratch.cursor.copy(camera.position).addScaledVector(scratch.dir, controls.cursorDistance);
      const joints = tracked.fingertips.map((tip): Tuple3 => {
        scratch.tip
          .set(tip[0] - tracked.palm[0], tip[1] - tracked.palm[1], tip[2] - tracked.palm[2])
          .multiplyScalar(GHOST_SCALE)
          .applyQuaternion(camera.quaternion)
          .add(scratch.cursor);
        return [scratch.tip.x, scratch.tip.y, scratch.tip.z];
      });
      Object.assign(patch, {
        pointer: s.pointer,
        pinch: tracked.pinchStrength,
        grab: tracked.grabStrength,
        rollDeg: tracked.rollRadians * DEG,
        hoverTarget: snapshot.hover,
        draggingSpriteId: snapshot.draggingSpriteId,
        floorPoint: floor ? [floor.x, 0, floor.z] : hand.floorPoint,
        joints: joints.length > 0 ? joints : null,
      } satisfies Partial<HandPose>);
    } else if (s.tracking) {
      // The hand just left: clear what it was doing (keyboard hover takes over from null).
      filter.reset();
      Object.assign(patch, {
        pinch: 0,
        grab: 0,
        rollDeg: 0,
        hoverTarget: null,
        draggingSpriteId: null,
        floorPoint: null,
        joints: null,
      } satisfies Partial<HandPose>);
    }
    s.tracking = tracked !== null;
    if (!samePose(hand, patch)) setHand(patch);
  }, -1);

  const ringArmed = phase === "awaitMandate" || phase === "signing" || controls.forceHandshakeRing;
  return (
    <group>
      <HoverHalo />
      <HandCursor distance={controls.cursorDistance} ghost={controls.ghostHand} />
      <HandshakeRing visible={ringArmed} />
    </group>
  );
}
