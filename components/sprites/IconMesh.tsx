"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  type BufferGeometry,
} from "three";
import type { IconKind, SpriteIcon } from "./icons";

// Low-poly procedural icons built from a handful of shared unit primitives and cached materials.

type Vec3 = [number, number, number];
type GeometryKey = "sphere" | "cone" | "cylinder" | "box" | "star";

interface Part {
  geometry: GeometryKey;
  color: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3 | number;
  /** Glass-like parts glow harder. */
  glow?: boolean;
}

const HALF_PI = Math.PI / 2;

const PARTS: Record<IconKind, Part[]> = {
  dino: [
    { geometry: "sphere", color: "#45d483", scale: [0.55, 0.36, 0.36] },
    { geometry: "sphere", color: "#45d483", position: [0.48, 0.34, 0], scale: [0.26, 0.21, 0.21] },
    { geometry: "cone", color: "#45d483", position: [-0.62, 0.04, 0], rotation: [0, 0, HALF_PI], scale: [0.2, 0.62, 0.2] },
    { geometry: "box", color: "#2a9a5a", position: [0.22, -0.4, 0], scale: [0.14, 0.26, 0.3] },
    { geometry: "box", color: "#2a9a5a", position: [-0.2, -0.4, 0], scale: [0.14, 0.26, 0.3] },
    { geometry: "cone", color: "#2474ff", position: [-0.22, 0.36, 0], scale: [0.09, 0.2, 0.09] },
    { geometry: "cone", color: "#2474ff", position: [0.02, 0.41, 0], scale: [0.09, 0.22, 0.09] },
    { geometry: "cone", color: "#2474ff", position: [0.24, 0.36, 0], scale: [0.09, 0.2, 0.09] },
  ],
  doll: [
    { geometry: "cone", color: "#ff8fcf", position: [0, -0.18, 0], scale: [0.36, 0.62, 0.36] },
    { geometry: "sphere", color: "#ffd9bd", position: [0, 0.3, 0], scale: 0.2 },
    { geometry: "sphere", color: "#8a4b2a", position: [0, 0.37, -0.05], scale: [0.22, 0.18, 0.2] },
    { geometry: "box", color: "#ffe5f5", position: [0, 0.05, 0], scale: [0.5, 0.07, 0.1] },
  ],
  star: [{ geometry: "star", color: "#ffd34d", scale: 0.5, glow: true }],
  bulb: [
    { geometry: "sphere", color: "#ffcf7a", position: [0, 0.12, 0], scale: [0.3, 0.34, 0.3], glow: true },
    { geometry: "cylinder", color: "#b9b4ad", position: [0, -0.28, 0], scale: [0.14, 0.24, 0.14] },
  ],
  bow: [
    { geometry: "cone", color: "#ff5fa8", position: [-0.24, 0, 0], rotation: [0, 0, -HALF_PI], scale: [0.24, 0.44, 0.16] },
    { geometry: "cone", color: "#ff5fa8", position: [0.24, 0, 0], rotation: [0, 0, HALF_PI], scale: [0.24, 0.44, 0.16] },
    { geometry: "sphere", color: "#ff8fcf", scale: 0.11 },
    { geometry: "box", color: "#ff5fa8", position: [-0.1, -0.26, 0], rotation: [0, 0, -0.35], scale: [0.08, 0.4, 0.05] },
    { geometry: "box", color: "#ff5fa8", position: [0.1, -0.26, 0], rotation: [0, 0, 0.35], scale: [0.08, 0.4, 0.05] },
  ],
  bauble: [
    { geometry: "sphere", color: "#e8c15a", scale: 0.34, glow: true },
    { geometry: "cylinder", color: "#fff4d6", position: [0, 0.36, 0], scale: [0.09, 0.1, 0.09] },
    { geometry: "box", color: "#fff4d6", scale: [0.7, 0.06, 0.06] },
  ],
  snowflake: [
    { geometry: "box", color: "#e6f6ff", scale: [0.9, 0.08, 0.06], glow: true },
    { geometry: "box", color: "#e6f6ff", rotation: [0, 0, Math.PI / 3], scale: [0.9, 0.08, 0.06], glow: true },
    { geometry: "box", color: "#e6f6ff", rotation: [0, 0, -Math.PI / 3], scale: [0.9, 0.08, 0.06], glow: true },
  ],
  gift: [
    { geometry: "box", color: "#e0463b", scale: 0.5 },
    { geometry: "box", color: "#ffd34d", scale: [0.52, 0.52, 0.1] },
    { geometry: "box", color: "#ffd34d", scale: [0.1, 0.52, 0.52] },
  ],
};

let geometries: Record<GeometryKey, BufferGeometry> | undefined;

function starGeometry(): BufferGeometry {
  const shape = new Shape();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? 1 : 0.45;
    const angle = (i / 10) * Math.PI * 2 + HALF_PI;
    const [x, y] = [Math.cos(angle) * radius, Math.sin(angle) * radius];
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false }).center();
}

function sharedGeometries() {
  geometries ??= {
    sphere: new SphereGeometry(1, 12, 8),
    cone: new ConeGeometry(1, 1, 8),
    cylinder: new CylinderGeometry(1, 1, 1, 8),
    box: new BoxGeometry(1, 1, 1),
    star: starGeometry(),
  };
  return geometries;
}

const materials = new Map<string, MeshStandardMaterial>();

function iconMaterial(color: string, glow = false): MeshStandardMaterial {
  const key = `${color}:${glow}`;
  let material = materials.get(key);
  if (!material) {
    material = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: glow ? 0.9 : 0.35,
      roughness: 0.55,
      flatShading: true,
    });
    materials.set(key, material);
  }
  return material;
}

/** One icon, about one unit across; the orbit scales it down. */
export function IconMesh({ icon }: { icon: SpriteIcon }) {
  const geos = sharedGeometries();
  // Color-changing bulbs need their own material to cycle hue; everything else shares.
  const rainbow = useMemo(
    () => (icon.rainbow ? new MeshStandardMaterial({ color: "#ffffff", roughness: 0.4, flatShading: true }) : null),
    [icon.rainbow],
  );
  useEffect(() => () => rainbow?.dispose(), [rainbow]);

  useFrame(({ clock }) => {
    if (!rainbow) return;
    const hue = (clock.elapsedTime * 0.25) % 1;
    rainbow.color.setHSL(hue, 0.9, 0.6);
    rainbow.emissive.setHSL(hue, 0.9, 0.5);
    rainbow.emissiveIntensity = 1.1;
  });

  return (
    <group>
      {PARTS[icon.kind].map((part, index) => (
        <mesh
          key={index}
          geometry={geos[part.geometry]}
          material={rainbow && part.glow ? rainbow : iconMaterial(part.color, part.glow)}
          position={part.position ?? [0, 0, 0]}
          rotation={part.rotation ?? [0, 0, 0]}
          scale={part.scale ?? 1}
        />
      ))}
    </group>
  );
}
