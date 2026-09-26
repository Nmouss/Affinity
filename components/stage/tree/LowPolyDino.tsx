"use client";

import { createContext, forwardRef, useContext } from "react";
import type { Group } from "three";

type Vec3 = [number, number, number];

export interface DinoColors {
  body: string;
  belly: string;
  spikes: string;
}

export const DINO_GREEN: DinoColors = { body: "#3fae4a", belly: "#b4e57e", spikes: "#23793a" };

const SPIKES: Vec3[] = [
  [0, 0.99, 0.2],
  [0, 0.78, 0.06],
  [0, 0.72, -0.1],
  [0, 0.64, -0.25],
  [0, 0.55, -0.4],
  [0, 0.46, -0.55],
];

/** Emissive self-glow for every part, so small ornaments read against the green tree. */
const GlowContext = createContext(0);

function Part({
  shape,
  position,
  scale,
  rotation,
  color,
  roughness = 0.35,
}: {
  shape: "ico" | "box" | "cone" | "sphere";
  position: Vec3;
  scale: Vec3;
  rotation?: Vec3;
  color: string;
  roughness?: number;
}) {
  const glow = useContext(GlowContext);
  return (
    <mesh position={position} scale={scale} rotation={rotation}>
      {shape === "ico" && <icosahedronGeometry args={[1, 1]} />}
      {shape === "box" && <boxGeometry args={[1, 1, 1]} />}
      {shape === "cone" && <coneGeometry args={[1, 1, 6]} />}
      {shape === "sphere" && <sphereGeometry args={[1, 10, 8]} />}
      <meshStandardMaterial color={color} roughness={roughness} emissive={color} emissiveIntensity={glow} flatShading />
    </mesh>
  );
}

/**
 * A stylized low-poly T-rex, 1 unit tall, standing on y = 0 and facing +z. Scaled up it is the
 * vetoed inflatable; scaled down it is a dinosaur ornament, so the one visibly becomes the other.
 */
export const LowPolyDino = forwardRef<Group, { colors?: DinoColors; detailed?: boolean; glow?: number }>(function LowPolyDino(
  { colors = DINO_GREEN, detailed = true, glow = 0 },
  ref,
) {
  const { body, belly, spikes } = colors;
  return (
    <GlowContext.Provider value={glow}>
      <group ref={ref}>
        {[-1, 1].map((side) => (
          <group key={side}>
            <Part shape="ico" position={[side * 0.13, 0.36, -0.02]} scale={[0.11, 0.15, 0.14]} color={body} />
            <Part shape="box" position={[side * 0.14, 0.16, 0.02]} scale={[0.09, 0.28, 0.1]} color={body} />
            <Part shape="box" position={[side * 0.14, 0.03, 0.07]} scale={[0.13, 0.06, 0.22]} color={spikes} />
            <Part shape="box" position={[side * 0.14, 0.6, 0.26]} rotation={[-0.9, 0, side * 0.2]} scale={[0.045, 0.13, 0.045]} color={body} />
          </group>
        ))}
        <Part shape="ico" position={[0, 0.52, 0]} rotation={[-0.45, 0, 0]} scale={[0.24, 0.27, 0.32]} color={body} />
        <Part shape="ico" position={[0, 0.5, 0.13]} rotation={[-0.45, 0, 0]} scale={[0.17, 0.22, 0.16]} color={belly} />
        <Part shape="box" position={[0, 0.74, 0.17]} rotation={[0.35, 0, 0]} scale={[0.17, 0.24, 0.17]} color={body} />
        <Part shape="box" position={[0, 0.89, 0.27]} scale={[0.26, 0.19, 0.3]} color={body} />
        <Part shape="box" position={[0, 0.86, 0.47]} scale={[0.21, 0.12, 0.2]} color={body} />
        <Part shape="box" position={[0, 0.77, 0.36]} rotation={[0.22, 0, 0]} scale={[0.2, 0.05, 0.3]} color={belly} />
        <Part shape="cone" position={[0, 0.4, -0.5]} rotation={[-Math.PI / 2 - 0.35, 0, 0]} scale={[0.13, 0.62, 0.13]} color={body} />
        {detailed && (
          <>
            {[-1, 1].map((side) => (
              <group key={side}>
                <Part shape="sphere" position={[side * 0.125, 0.93, 0.33]} scale={[0.04, 0.04, 0.04]} color="#ffffff" roughness={0.2} />
                <Part shape="sphere" position={[side * 0.14, 0.935, 0.345]} scale={[0.022, 0.022, 0.022]} color="#111111" roughness={0.2} />
              </group>
            ))}
            {[0.4, 0.46, 0.52].flatMap((z) =>
              [-1, 1].map((side) => (
                <Part
                  key={`${z}${side}`}
                  shape="cone"
                  position={[side * 0.08, 0.785, z]}
                  rotation={[Math.PI, 0, 0]}
                  scale={[0.018, 0.04, 0.018]}
                  color="#ffffff"
                />
              )),
            )}
            {SPIKES.map((position, index) => (
              <Part key={index} shape="cone" position={position} rotation={[-0.3, 0, 0]} scale={[0.04, 0.08, 0.04]} color={spikes} />
            ))}
          </>
        )}
      </group>
    </GlowContext.Provider>
  );
});
