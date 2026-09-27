"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { button, useControls } from "leva";
import { easing } from "maath";
import { Vector3 } from "three";
import { emitGesture, onGesture } from "@/lib/stage/bus";
import { CAMERA, ROOM } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";

const PARALLAX = { x: 0.7, y: 0.35 } as const;
/** Keeps the orbit camera inside the shell no matter the target/radius/azimuth combination. */
const WALL_MARGIN = 0.5;

function clampToRoom(x: number, y: number, z: number): [number, number, number] {
  return [
    Math.min(ROOM.leftWallX + ROOM.width - WALL_MARGIN, Math.max(ROOM.leftWallX + WALL_MARGIN, x)),
    Math.min(ROOM.height - WALL_MARGIN, Math.max(WALL_MARGIN, y)),
    Math.min(ROOM.backWallZ + ROOM.depth - WALL_MARGIN, Math.max(ROOM.backWallZ + WALL_MARGIN, z)),
  ];
}

/**
 * Drives the default camera every frame from the scene slice: the fixed home view with a little
 * hand parallax, or the inspect view orbiting the centerpiece. Both glide with critically damped easing.
 */
export function CameraRig() {
  const goal = useRef(new Vector3(...CAMERA.position));
  const lookGoal = useRef(new Vector3(...CAMERA.target));
  const look = useRef(new Vector3(...CAMERA.target));

  const { radius, baseAzimuth, baseElevation } = useControls("Camera", {
    radius: { value: 7.5, min: 3, max: 20 },
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
    if (scene.cameraMode === "orbit") {
      const azimuth = baseAzimuth + scene.orbit.azimuth;
      const elevation = baseElevation + scene.orbit.polar;
      const [tx, ty, tz] = scene.inspectTarget;
      goal.current.set(
        ...clampToRoom(
          tx + Math.sin(azimuth) * Math.cos(elevation) * radius,
          ty + Math.sin(elevation) * radius,
          tz + Math.cos(azimuth) * Math.cos(elevation) * radius,
        ),
      );
      lookGoal.current.set(tx, ty, tz);
    } else {
      goal.current.set(CAMERA.position[0] + px * PARALLAX.x, CAMERA.position[1] + py * PARALLAX.y, CAMERA.position[2]);
      lookGoal.current.set(CAMERA.target[0] + px * 0.15, CAMERA.target[1] + py * 0.1, CAMERA.target[2]);
    }

    const dt = Math.min(delta, 0.1);
    easing.damp3(camera.position, goal.current, scene.cameraMode === "orbit" ? 0.5 : 0.6, dt);
    easing.damp3(look.current, lookGoal.current, 0.4, dt);
    camera.lookAt(look.current);
  });

  return null;
}
