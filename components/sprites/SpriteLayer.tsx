"use client";

import { useEffect, useRef } from "react";
import type { Mesh } from "three";
import { COUNCIL_RING, SPRITE_FLOAT_HEIGHT, homePosition, seatPosition } from "@/lib/stage/layout";
import { FAMILY } from "@/lib/stage/slices/council";
import { useStage } from "@/lib/stage/store";
import { registerTarget } from "@/lib/stage/targets";

// Placeholder owned by the sprites track: plain spheres and seat rings, registered as targets so the
// hands track can hit-test before the real avatars exist.

function PlaceholderSprite({ id, color }: { id: string; color: string }) {
  const mesh = useRef<Mesh>(null);
  const seat = useStage((state) => state.sprites[id]?.seat ?? null);

  useEffect(() => (mesh.current ? registerTarget(`sprite:${id}`, mesh.current, 0.9) : undefined), [id]);

  const [x, , z] = seat === null ? homePosition(id) : seatPosition(seat);
  return (
    <mesh ref={mesh} position={[x, SPRITE_FLOAT_HEIGHT, z]}>
      <sphereGeometry args={[0.6, 32, 32]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
    </mesh>
  );
}

function PlaceholderSeat({ index }: { index: number }) {
  const mesh = useRef<Mesh>(null);

  useEffect(() => (mesh.current ? registerTarget(`seat:${index}`, mesh.current, 1) : undefined), [index]);

  const [x, , z] = seatPosition(index);
  return (
    <mesh ref={mesh} position={[x, 0.02, z]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.7, 0.9, 40]} />
      <meshBasicMaterial color="#ffd18a" transparent opacity={0.5} />
    </mesh>
  );
}

export function SpriteLayer() {
  return (
    <group>
      {COUNCIL_RING.seatAngles.map((_, index) => (
        <PlaceholderSeat key={index} index={index} />
      ))}
      {FAMILY.map((profile) => (
        <PlaceholderSprite key={profile.id} id={profile.id} color={profile.colors[0] ?? "#ffffff"} />
      ))}
    </group>
  );
}
