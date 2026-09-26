"use client";

import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { useControls } from "leva";
import { ROOM } from "@/lib/stage/layout";

// The fire light lives in Hearth and the lamp in Furniture; this is the cool window light, the low
// fill, and a baked Lightformer environment for reflections (no HDR download).
export function Lighting() {
  const { moon, hemisphere, ambient, envIntensity } = useControls("Lighting", {
    moon: { value: 0.55, min: 0, max: 3 },
    hemisphere: { value: 0.35, min: 0, max: 2 },
    ambient: { value: 0.08, min: 0, max: 1 },
    envIntensity: { value: 0.35, min: 0, max: 2 },
  });

  return (
    <>
      <hemisphereLight args={["#50608a", "#3a2418", hemisphere]} />
      <ambientLight color="#ffd9b0" intensity={ambient} />
      <directionalLight position={[ROOM.leftWallX - 8, 10, -3]} color="#8fb0ff" intensity={moon} />
      <Environment resolution={64} frames={1} environmentIntensity={envIntensity}>
        <Lightformer form="rect" intensity={3} color="#ff9a4d" position={[0, 2, -9]} scale={[6, 4, 1]} />
        <Lightformer form="rect" intensity={1.5} color="#7fa2ff" position={[-11, 5, -3]} rotation-y={Math.PI / 2} scale={[4, 4, 1]} />
        <Lightformer form="ring" intensity={1.2} color="#ffd6a0" position={[9, 6, -5]} scale={2} />
        <Lightformer form="rect" intensity={0.4} color="#fff1e0" position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[20, 16, 1]} />
      </Environment>
      <ContactShadows position={[0, 0.02, 0]} scale={[ROOM.width, ROOM.depth]} resolution={512} blur={2.4} opacity={0.55} far={6} color="#1a0c05" />
    </>
  );
}
