"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { PLAZA } from "./formation";

// The plaza's sky and light, in the spirit of the Mii Plaza and Tomodachi Life: a pale blue dome
// that warms to cream at the horizon, a few soft toy clouds drifting far away, bright even fill
// with one warm key light, and soft contact shadows that sit the characters on the floor. All
// generated in code (no image assets) and cheap: one dome, a handful of spheres, one shadow pass.

const DOME_RADIUS = 60;
const CLOUD_COUNT = 6;
// Clouds live in the far arc behind the plaza, low, in the strip of sky the camera sees over the
// rim; they sway sideways a little rather than orbiting into the foreground.
const CLOUD_RING = [27, 35] as const;
const CLOUD_ARC = 2.4;
const CLOUD_HEIGHT = [-0.6, 1.0] as const;
const CLOUD_SWAY = 1.6;
const CLOUD_SWAY_SPEED = 0.06;

function skyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, "#8fc3ff");
  gradient.addColorStop(0.4, "#bfdcff");
  gradient.addColorStop(0.52, "#dcecfb");
  gradient.addColorStop(0.6, "#f2f3ea");
  gradient.addColorStop(0.72, "#f7efe1");
  gradient.addColorStop(1, "#e6d9c4");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

interface Cloud {
  x: number;
  z: number;
  height: number;
  scale: number;
  phase: number;
  puffs: Array<[number, number, number, number]>;
}

function makeClouds(): Cloud[] {
  const random = mulberry(7);
  return Array.from({ length: CLOUD_COUNT }, (_, index) => {
    const puffCount = 3 + Math.floor(random() * 3);
    const puffs: Array<[number, number, number, number]> = [];
    for (let i = 0; i < puffCount; i += 1) {
      const t = puffCount === 1 ? 0 : i / (puffCount - 1) - 0.5;
      puffs.push([t * 2.6, (0.5 - Math.abs(t)) * 0.9 + random() * 0.3, (random() - 0.5) * 0.8, 0.9 + (0.5 - Math.abs(t)) * 0.9 + random() * 0.25]);
    }
    // Spread across the arc behind the plaza (the camera looks toward -z).
    const angle = -Math.PI / 2 + (index / (CLOUD_COUNT - 1) - 0.5) * CLOUD_ARC + (random() - 0.5) * 0.15;
    const radius = CLOUD_RING[0] + random() * (CLOUD_RING[1] - CLOUD_RING[0]);
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      height: CLOUD_HEIGHT[0] + random() * (CLOUD_HEIGHT[1] - CLOUD_HEIGHT[0]),
      scale: 1.2 + random() * 0.7,
      phase: random() * Math.PI * 2,
      puffs,
    };
  });
}

/** Small deterministic PRNG so the clouds are the same every visit. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const puffGeometry = new THREE.SphereGeometry(1, 20, 14);
const cloudMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, metalness: 0, emissive: "#ffffff", emissiveIntensity: 0.22 });

function Clouds() {
  const clouds = useMemo(makeClouds, []);
  const groups = useRef<Array<THREE.Group | null>>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * CLOUD_SWAY_SPEED;
    clouds.forEach((cloud, index) => {
      const group = groups.current[index];
      if (group) group.position.x = cloud.x + Math.sin(t + cloud.phase) * CLOUD_SWAY;
    });
  });
  return (
    <group>
      {clouds.map((cloud, index) => (
        <group
          key={index}
          ref={(node) => {
            groups.current[index] = node;
          }}
          position={[cloud.x, cloud.height, cloud.z]}
          scale={cloud.scale}
        >
          {cloud.puffs.map(([x, y, z, r], puff) => (
            <mesh key={puff} geometry={puffGeometry} material={cloudMaterial} position={[x, y, z]} scale={[r, r * 0.82, r]} />
          ))}
        </group>
      ))}
    </group>
  );
}

export function PlazaSky() {
  const sky = useMemo(skyTexture, []);
  useEffect(() => () => sky.dispose(), [sky]);
  return (
    <group>
      {/* Sky dome: seen from inside, gradient from pale blue overhead to warm cream at the ground. */}
      <mesh>
        <sphereGeometry args={[DOME_RADIUS, 32, 24]} />
        <meshBasicMaterial map={sky} side={THREE.BackSide} toneMapped={false} depthWrite={false} />
      </mesh>
      <Clouds />
      {/* Bright, even Mii-style light: sky fill from above, one warm key, a cool fill from the right. */}
      <hemisphereLight args={["#fbfdff", "#f3e7d3", 1.35]} />
      <ambientLight intensity={0.35} color="#fff8ee" />
      <directionalLight position={[-6, 12, 7]} intensity={1.15} color="#fff1d6" />
      <directionalLight position={[8, 6, -4]} intensity={0.3} color="#dbe9ff" />
      {/* Soft shadows under everyone on the floor; one blurred pass, refreshed as the crowd moves. */}
      <ContactShadows position={[0, 0.004, 0]} scale={(PLAZA.radius + 4) * 2} far={3.2} blur={2.6} opacity={0.34} resolution={1024} color="#4a3f33" frames={Infinity} />
    </group>
  );
}
