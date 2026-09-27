"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type InstancedMesh } from "three";
import { anchorName, bulbPositions, proceduralAnchorPositions, treeProfile, treeTiers } from "./anchors";
import type { LightsStyle } from "./catalog";

const BULB_COUNT = 64;
const TIER_GREENS = ["#1d5e35", "#22693b", "#277442", "#2c7d47"];
const WARM = new Color("#ffc46b");

/** Twinkling garland bulbs: one instanced draw call, colors rewritten each frame. */
function Bulbs({ heightFt, style }: { heightFt: number; style: LightsStyle }) {
  const mesh = useRef<InstancedMesh>(null);
  const positions = useMemo(() => bulbPositions(heightFt, BULB_COUNT), [heightFt]);
  const color = useMemo(() => new Color(), []);

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const dummy = new Object3D();
    positions.forEach((position, index) => {
      dummy.position.set(...position);
      dummy.updateMatrix();
      instanced.setMatrixAt(index, dummy.matrix);
      instanced.setColorAt(index, WARM);
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, [positions]);

  useFrame(({ clock }) => {
    const instanced = mesh.current;
    if (!instanced) return;
    const time = clock.elapsedTime;
    for (let index = 0; index < BULB_COUNT; index += 1) {
      const twinkle = 0.55 + 0.45 * Math.sin(time * (1.3 + (index % 5) * 0.37) + index * 2.3);
      if (style === "multi") {
        color.setHSL((index * 0.17 + time * 0.08) % 1, 0.95, 0.55).multiplyScalar(1.4 + twinkle * 2.2);
      } else {
        color.copy(WARM).multiplyScalar(1.3 + twinkle * 2);
      }
      instanced.setColorAt(index, color);
    }
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, BULB_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[Math.max(0.045, heightFt * 0.014), 8, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/**
 * Stand-in for /models/tree<N>.glb: stacked low-poly cones, a trunk, a pot, twinkling bulbs, and the
 * same ornament_01…12 anchor nodes plus a `topper` node, so everything downstream works unchanged.
 */
export function ProceduralTree({ heightFt, lights }: { heightFt: number; lights: LightsStyle }) {
  const profile = useMemo(() => treeProfile(heightFt), [heightFt]);
  const tiers = useMemo(() => treeTiers(heightFt), [heightFt]);
  const anchors = useMemo(() => proceduralAnchorPositions(heightFt), [heightFt]);
  const potRadius = heightFt * 0.12;

  return (
    <group>
      <mesh position-y={profile.potHeight / 2}>
        <cylinderGeometry args={[potRadius, potRadius * 0.8, profile.potHeight, 20]} />
        <meshStandardMaterial color="#a8322c" roughness={0.6} />
      </mesh>
      <mesh position-y={profile.potHeight * 0.92}>
        <cylinderGeometry args={[potRadius * 1.04, potRadius * 1.04, profile.potHeight * 0.16, 20]} />
        <meshStandardMaterial color="#d9a93f" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position-y={(profile.potHeight + profile.foliageBottom) / 2 + 0.05}>
        <cylinderGeometry args={[heightFt * 0.03, heightFt * 0.035, profile.foliageBottom - profile.potHeight + 0.2, 8]} />
        <meshStandardMaterial color="#5a3a22" roughness={0.9} />
      </mesh>
      {tiers.map((tier, index) => (
        <mesh key={index} position-y={(tier.bottom + tier.top) / 2} rotation-y={index * 0.4}>
          <coneGeometry args={[tier.radius, tier.top - tier.bottom, 9, 1]} />
          <meshStandardMaterial color={TIER_GREENS[index % TIER_GREENS.length]} roughness={0.8} flatShading />
        </mesh>
      ))}
      <Bulbs heightFt={heightFt} style={lights} />
      {anchors.map((position, index) => (
        <object3D key={index} name={anchorName(index + 1)} position={position} />
      ))}
      <object3D name="topper" position={[0, profile.foliageTop - 0.02, 0]} />
    </group>
  );
}
