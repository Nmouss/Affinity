"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
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
const CLOUD_RING = [30, 38] as const;
const CLOUD_ARC = 1.7;
const CLOUD_HEIGHT = [-0.6, 1.0] as const;
/** Sideways drift in world ft per second, plus a gentle bob; clouds that leave the arc wrap round. */
const CLOUD_DRIFT = 0.55;
const CLOUD_BOB = 0.25;
const CLOUD_BOB_SPEED = 0.35;
const CLOUD_WRAP_X = 34;
/** How far a grabbed cloud may be lifted or lowered from its home height. */
const CLOUD_LIFT = [-1.5, 6] as const;

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

/** Grab state for the cloud under the mouse: where it was picked, and the plane it slides on. */
interface CloudGrab {
  index: number;
  pointerId: number;
  /** Cloud-position minus hit-point at grab time, so it doesn't jump to the cursor. */
  offset: THREE.Vector3;
  /** A plane through the cloud facing the camera; the drag stays on it so depth doesn't change. */
  plane: THREE.Plane;
}

const hitScratch = new THREE.Vector3();

// Clouds are the plaza's one bit of pure play: they drift by themselves, and you can reach up and
// drag one somewhere else, then let it carry on drifting from there. They use three.js pointer
// events directly (a separate track from the crowd's pointer store), so grabbing a cloud never
// counts as picking or dragging a person.
function Clouds({ onGrabbing }: { onGrabbing?: (grabbing: boolean) => void }) {
  const clouds = useMemo(makeClouds, []);
  const groups = useRef<Array<THREE.Group | null>>([]);
  /** Per-cloud drift offsets and lifts, so a dragged cloud keeps its new spot. */
  const offsets = useRef(clouds.map(() => ({ x: 0, lift: 0 })));
  const grab = useRef<CloudGrab | null>(null);
  const hovered = useRef<number | null>(null);
  // Read-only handle for browser checks (the headless walkthrough watches grabs through it).
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as unknown as { __affinityClouds?: unknown }).__affinityClouds = { offsets: offsets.current, grab };
  }, []);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    clouds.forEach((cloud, index) => {
      const group = groups.current[index];
      if (!group) return;
      const offset = offsets.current[index]!;
      if (grab.current?.index !== index) {
        // Each cloud keeps its own pace (bigger ones drift a touch slower, as if further off).
        offset.x += delta * CLOUD_DRIFT * (1.15 - cloud.scale * 0.2);
        const x = cloud.x + offset.x;
        if (x > CLOUD_WRAP_X) offset.x -= CLOUD_WRAP_X * 2 + (cloud.x > 0 ? cloud.x : 0);
        group.position.x = cloud.x + offset.x;
        group.position.y = cloud.height + offset.lift + Math.sin(t * CLOUD_BOB_SPEED + cloud.phase) * CLOUD_BOB;
      }
      // A held or hovered cloud puffs up a little, the plaza's usual "you can touch this" cue.
      const target = grab.current?.index === index ? cloud.scale * 1.1 : hovered.current === index ? cloud.scale * 1.05 : cloud.scale;
      group.scale.setScalar(THREE.MathUtils.damp(group.scale.x, target, 10, delta));
    });
  });

  const down = (index: number) => (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.stopPropagation();
    const group = groups.current[index];
    if (!group) return;
    const normal = event.camera.getWorldDirection(new THREE.Vector3()).negate();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, group.position);
    const offset = group.position.clone().sub(event.point);
    grab.current = { index, pointerId: event.pointerId, offset, plane };
    (event.target as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(event.pointerId);
    onGrabbing?.(true);
  };

  const move = (event: ThreeEvent<PointerEvent>) => {
    const current = grab.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const group = groups.current[current.index];
    const cloud = clouds[current.index];
    if (!group || !cloud) return;
    if (!event.ray.intersectPlane(current.plane, hitScratch)) return;
    hitScratch.add(current.offset);
    const lift = THREE.MathUtils.clamp(hitScratch.y - cloud.height, CLOUD_LIFT[0], CLOUD_LIFT[1]);
    offsets.current[current.index] = { x: hitScratch.x - cloud.x, lift };
    group.position.x = hitScratch.x;
    group.position.y = cloud.height + lift;
  };

  const up = (event: ThreeEvent<PointerEvent>) => {
    const current = grab.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    (event.target as Element & { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(event.pointerId);
    grab.current = null;
    onGrabbing?.(false);
  };

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
          onPointerDown={down(index)}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerOver={(event) => {
            event.stopPropagation();
            hovered.current = index;
          }}
          onPointerOut={() => {
            if (hovered.current === index) hovered.current = null;
          }}
        >
          {cloud.puffs.map(([x, y, z, r], puff) => (
            <mesh key={puff} geometry={puffGeometry} material={cloudMaterial} position={[x, y, z]} scale={[r, r * 0.82, r]} />
          ))}
        </group>
      ))}
    </group>
  );
}

export function PlazaSky({ onGrabbing }: { onGrabbing?: (grabbing: boolean) => void } = {}) {
  const sky = useMemo(skyTexture, []);
  useEffect(() => () => sky.dispose(), [sky]);
  return (
    <group>
      {/* Sky dome: seen from inside, gradient from pale blue overhead to warm cream at the ground. */}
      <mesh>
        <sphereGeometry args={[DOME_RADIUS, 32, 24]} />
        <meshBasicMaterial map={sky} side={THREE.BackSide} toneMapped={false} depthWrite={false} />
      </mesh>
      <Clouds onGrabbing={onGrabbing} />
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
