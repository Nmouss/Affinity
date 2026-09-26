"use client";

import { useEffect, useRef } from "react";
import type { Mesh } from "three";
import { HEARTH, ROOM } from "@/lib/stage/layout";
import { registerTarget } from "@/lib/stage/targets";

// Placeholder owned by the room track: a floor, basic lights, and the hearth registered as a target.
export function RoomLayer() {
  const hearth = useRef<Mesh>(null);

  useEffect(() => (hearth.current ? registerTarget("hearth", hearth.current, 1.8) : undefined), []);

  return (
    <group>
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 12, 6]} intensity={0.6} />
      <pointLight position={[HEARTH.position[0], 2, HEARTH.position[2] + 1.5]} intensity={40} color="#ff9a4d" />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshStandardMaterial color="#3b2a22" />
      </mesh>
      <mesh ref={hearth} position={[HEARTH.position[0], 1.5, HEARTH.position[2]]}>
        <boxGeometry args={[4, 3, 1]} />
        <meshStandardMaterial color="#6b3b2a" emissive="#ff5a1f" emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}
