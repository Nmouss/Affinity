"use client";

import { useRef, type RefObject } from "react";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useControls } from "leva";
import { ROOM } from "@/lib/stage/layout";

/**
 * EffectComposer leaves gl.autoClear off between its renders, so ContactShadows would never clear
 * its render target and moving objects would smear. These bracket its useFrame (callbacks of equal
 * priority run in mount order) to turn autoClear on just for it.
 */
function AutoClear({ saved, restore = false }: { saved: RefObject<boolean>; restore?: boolean }) {
  useFrame(({ gl }) => {
    if (restore) {
      gl.autoClear = saved.current;
    } else {
      saved.current = gl.autoClear;
      gl.autoClear = true;
    }
  });
  return null;
}

// Bright, even fill so 2D/3D content stays the visual focus, not the room's atmosphere: a soft
// neutral key light, a baked Lightformer environment for reflections (no HDR download), and light
// contact shadows.
export function Lighting() {
  const { key, hemisphere, ambient, envIntensity } = useControls("Lighting", {
    key: { value: 1.4, min: 0, max: 3 },
    hemisphere: { value: 0.9, min: 0, max: 2 },
    ambient: { value: 0.55, min: 0, max: 1 },
    envIntensity: { value: 0.6, min: 0, max: 2 },
  });

  const savedAutoClear = useRef(false);

  return (
    <>
      <hemisphereLight args={["#ffffff", "#dcdcd2", hemisphere]} />
      <ambientLight color="#ffffff" intensity={ambient} />
      <directionalLight position={[ROOM.leftWallX - 8, 10, -3]} color="#fff8ec" intensity={key} />
      <Environment resolution={64} frames={1} environmentIntensity={envIntensity}>
        <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[0, 2, -9]} scale={[6, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[-11, 5, -3]} rotation-y={Math.PI / 2} scale={[4, 4, 1]} />
        <Lightformer form="ring" intensity={1} color="#fff6e6" position={[9, 6, -5]} scale={2} />
        <Lightformer form="rect" intensity={1.4} color="#ffffff" position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[20, 16, 1]} />
      </Environment>
      <AutoClear saved={savedAutoClear} />
      <ContactShadows position={[0, 0.02, 0]} scale={[ROOM.width, ROOM.depth]} resolution={512} blur={2.4} opacity={0.25} far={6} color="#b8b0a0" />
      <AutoClear saved={savedAutoClear} restore />
    </>
  );
}
