"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { button, useControls } from "leva";
import { Color, type Group, type Mesh, type MeshBasicMaterial, type PointLight } from "three";
import { HEARTH } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import { registerTarget } from "@/lib/stage/targets";

const FLARE_MS = 1800;

/** 0..1, peaking right after the director convenes the council. */
function flareAmount(flareAt: number | null, now: number): number {
  if (flareAt === null) return 0;
  const t = (now - flareAt) / FLARE_MS;
  if (t < 0 || t > 1) return 0;
  return t < 0.12 ? t / 0.12 : (1 - t) ** 2;
}

/** The "convene" marker: a simple glowing pillar that brightens on hover and on convene. */
export function Hearth() {
  const target = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const glow = useRef<Mesh>(null);
  const hoverRing = useRef<Mesh>(null);
  const boost = useRef(1);

  const { intensity } = useControls("Hearth", {
    intensity: { value: 12, min: 0, max: 60 },
    flare: button(() => useStage.getState().flareFire()),
  });

  useEffect(() => (target.current ? registerTarget("hearth", target.current, 1.8) : undefined), []);

  useFrame((_, delta) => {
    const { scene, hand } = useStage.getState();
    const flare = flareAmount(scene.fireFlareAt, performance.now());
    const hovered = hand.hoverTarget === "hearth" ? 1 : 0;
    const goal = 1 + flare * 0.6 + hovered * 0.15;
    boost.current += (goal - boost.current) * Math.min(1, delta * 10);
    if (light.current) light.current.intensity = intensity * (1 + flare * 1.6 + hovered * 0.2);
    if (glow.current) glow.current.scale.setScalar(boost.current);
    if (hoverRing.current) {
      const material = hoverRing.current.material as MeshBasicMaterial;
      material.opacity += ((hovered ? 0.55 : 0) + flare * 0.5 - material.opacity) * Math.min(1, delta * 8);
    }
  });

  const glowColor = useMemo(() => new Color("#ffcf7a").multiplyScalar(1.6), []);
  const [hx, , hz] = HEARTH.position;

  return (
    <group position={[hx, 0, hz]}>
      <mesh position-y={0.06} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.6, 32]} />
        <meshStandardMaterial color="#eae5da" roughness={0.7} />
      </mesh>
      <mesh ref={hoverRing} position-y={0.08} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.35, 1.55, 48]} />
        <meshBasicMaterial color={glowColor} transparent opacity={0} toneMapped={false} />
      </mesh>
      <mesh position-y={0.9}>
        <cylinderGeometry args={[0.12, 0.14, 1.8, 16]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh ref={glow} position-y={1.9}>
        <sphereGeometry args={[0.28, 20, 20]} />
        <meshBasicMaterial color={glowColor} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 2, 0]} color="#ffd9a0" intensity={intensity} distance={0} decay={1.7} />
      <group ref={target} position={[0, 1.3, 0.5]} />
    </group>
  );
}
