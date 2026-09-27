"use client";

import { useMemo } from "react";
import { Furniture } from "../Furniture";
import { Snow } from "../Snow";
import { nightSkyTexture } from "../textures";

/** What the window looks out on for a winter/holiday mission: sky, snowy ground, pines, falling snow. */
export function WinterPreset() {
  const sky = useMemo(() => nightSkyTexture(), []);
  const pines: Array<[number, number, number]> = [
    [-14, 0, -6.5],
    [-16.5, 0, -2.5],
    [-13, 0, 0.5],
  ];
  return (
    <group>
      <mesh position={[-22, 5, -3]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[40, 22]} />
        <meshBasicMaterial map={sky} />
      </mesh>
      <mesh position={[-16, -0.4, -3]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[12, 30]} />
        <meshStandardMaterial color="#c9d8f2" roughness={1} />
      </mesh>
      {pines.map((position, index) => (
        <group key={index} position={position}>
          <mesh position-y={2.5 + index * 0.4}>
            <coneGeometry args={[1.4, 5 + index * 0.8, 7]} />
            <meshStandardMaterial color="#0f2a24" roughness={1} />
          </mesh>
        </group>
      ))}
      <Snow />
      <Furniture />
    </group>
  );
}
