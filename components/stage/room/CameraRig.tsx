"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { button, useControls } from "leva";
import { easing } from "maath";
import { Vector3 } from "three";
import { TIMING } from "@/components/stage/tree/timing";
import { emitGesture, onGesture } from "@/lib/stage/bus";
import { CAMERA } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";

const PARALLAX = { x: 0.7, y: 0.35 } as const;
const SHAKE_MS = 450;
/** While the vetoed T-rex stands, the home view pulls back and tilts up so its 8 ft fit in frame. */
const CONFLICT_FRAMING = { position: [-1.2, 0.8, 1.5], target: [-1.5, 1.6, 0] } as const;

/**
 * Drives the default camera every frame from the scene slice: the fixed home view with a little
 * hand parallax, or the inspect view orbiting the tree. Both glide with critically damped easing.
 */
export function CameraRig() {
  const goal = useRef(new Vector3(...CAMERA.position));
  const lookGoal = useRef(new Vector3(...CAMERA.target));
  const look = useRef(new Vector3(...CAMERA.target));

  const { radius, baseAzimuth, baseElevation } = useControls("Camera", {
    radius: { value: 12.5, min: 5, max: 20 },
    baseAzimuth: { value: -0.05, min: -1.2, max: 1.4 },
    baseElevation: { value: 0.16, min: -0.2, max: 1.2 },
    // Lab stand-ins for the open-palm gesture; they go through the bus and its arming policy.
    "orbit ◀": button(() => emitGesture({ type: "orbit", dx: -0.2, dy: 0 })),
    "orbit ▶": button(() => emitGesture({ type: "orbit", dx: 0.2, dy: 0 })),
    "orbit ▲": button(() => emitGesture({ type: "orbit", dx: 0, dy: 0.15 })),
  });

  useEffect(
    () =>
      onGesture((event) => {
        if (event.type === "orbit") useStage.getState().nudgeOrbit(event.dx, event.dy);
      }),
    [],
  );

  useFrame(({ camera }, delta) => {
    const { scene, hand } = useStage.getState();
    const [px, py] = hand.pointer;
    const now = performance.now();
    const beat = scene.conflictBeat;
    // The conflict beat plays out in the home view; the camera only heads to the tree once the
    // T-rex has shrunk into its box.
    const vetoStanding = beat !== null && (beat.resolveAt === null || now < beat.resolveAt + TIMING.vetoShrink * 0.8);
    if (scene.cameraMode === "orbit" && !vetoStanding) {
      const azimuth = baseAzimuth + scene.orbit.azimuth;
      const elevation = baseElevation + scene.orbit.polar;
      const [tx, ty, tz] = scene.inspectTarget;
      goal.current.set(
        tx + Math.sin(azimuth) * Math.cos(elevation) * radius,
        ty + Math.sin(elevation) * radius,
        tz + Math.cos(azimuth) * Math.cos(elevation) * radius,
      );
      lookGoal.current.set(tx, ty, tz);
    } else {
      const framing = vetoStanding ? 1 : 0;
      goal.current.set(
        CAMERA.position[0] + px * PARALLAX.x + CONFLICT_FRAMING.position[0] * framing,
        CAMERA.position[1] + py * PARALLAX.y + CONFLICT_FRAMING.position[1] * framing,
        CAMERA.position[2] + CONFLICT_FRAMING.position[2] * framing,
      );
      lookGoal.current.set(
        CAMERA.target[0] + px * 0.15 + CONFLICT_FRAMING.target[0] * framing,
        CAMERA.target[1] + py * 0.1 + CONFLICT_FRAMING.target[1] * framing,
        CAMERA.target[2],
      );
    }

    const dt = Math.min(delta, 0.1);
    easing.damp3(camera.position, goal.current, scene.cameraMode === "orbit" && !vetoStanding ? 0.5 : 0.6, dt);
    easing.damp3(look.current, lookGoal.current, 0.4, dt);

    // The VETO stamp lands with a small camera jolt.
    const sinceStamp = beat ? now - (beat.startedAt + TIMING.vetoStamp) : -1;
    if (sinceStamp >= 0 && sinceStamp < SHAKE_MS) {
      const amount = 0.12 * (1 - sinceStamp / SHAKE_MS) ** 2;
      camera.position.x += Math.sin(sinceStamp * 0.09) * amount;
      camera.position.y += Math.cos(sinceStamp * 0.11) * amount;
    }
    camera.lookAt(look.current);
  });

  return null;
}
