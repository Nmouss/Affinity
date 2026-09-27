"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { button, useControls } from "leva";
import {
  AdditiveBlending,
  BackSide,
  CatmullRomCurve3,
  Color,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type PointLight,
} from "three";
import { useCircle } from "@/lib/people/roster";
import { HEARTH } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import { registerTarget } from "@/lib/stage/targets";
import { brickTexture } from "./textures";

const FLARE_MS = 1800;
const OPENING = { width: 2.8, height: 2.5 } as const;
const SURROUND = { width: 5.4, height: 4.3, depth: 0.9 } as const;

/** Layered sines standing in for noise; cheap and never repeats visibly. */
function flicker(time: number, seed: number): number {
  return (
    Math.sin(time * 7.3 + seed) * 0.5 + Math.sin(time * 13.1 + seed * 2.1) * 0.3 + Math.sin(time * 23.7 + seed * 3.7) * 0.2
  );
}

/** 0..1, peaking right after the director convenes the council. */
function flareAmount(flareAt: number | null, now: number): number {
  if (flareAt === null) return 0;
  const t = (now - flareAt) / FLARE_MS;
  if (t < 0 || t > 1) return 0;
  return t < 0.12 ? t / 0.12 : (1 - t) ** 2;
}

interface Tongue {
  offset: [number, number, number];
  radius: number;
  height: number;
  color: string;
  intensity: number;
  opacity: number;
  seed: number;
}

const TONGUES: Tongue[] = [
  { offset: [0, 0, 0], radius: 0.55, height: 1.5, color: "#ff5a14", intensity: 2.2, opacity: 0.75, seed: 0 },
  { offset: [-0.42, 0, 0.05], radius: 0.32, height: 0.95, color: "#ff6a1a", intensity: 2.2, opacity: 0.7, seed: 1.7 },
  { offset: [0.45, 0, -0.02], radius: 0.34, height: 1.05, color: "#ff6a1a", intensity: 2.2, opacity: 0.7, seed: 3.1 },
  { offset: [0.05, 0, 0.08], radius: 0.36, height: 1.1, color: "#ffab3d", intensity: 3, opacity: 0.8, seed: 4.4 },
  { offset: [-0.05, 0, 0.12], radius: 0.18, height: 0.65, color: "#fff0b8", intensity: 4, opacity: 0.9, seed: 5.9 },
];

function Flame({ flameScale }: { flameScale: RefObject<number> }) {
  const meshes = useRef<Array<Mesh | null>>([]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    const boost = flameScale.current;
    TONGUES.forEach((tongue, index) => {
      const mesh = meshes.current[index];
      if (!mesh) return;
      const wave = flicker(time, tongue.seed);
      mesh.scale.set(boost * (1 + wave * 0.08), boost * (1 + wave * 0.22), boost * (1 + wave * 0.08));
      mesh.position.y = (tongue.height * mesh.scale.y) / 2;
      mesh.rotation.z = flicker(time * 0.6, tongue.seed + 9) * 0.08;
      (mesh.material as MeshBasicMaterial).opacity = tongue.opacity * Math.min(1, 0.85 + wave * 0.15 + (boost - 1) * 0.3);
    });
  });

  return (
    <group>
      {TONGUES.map((tongue, index) => (
        <group key={index} position={tongue.offset}>
          <mesh
            ref={(mesh) => {
              meshes.current[index] = mesh;
            }}
          >
            <coneGeometry args={[tongue.radius, tongue.height, 12, 1, true]} />
            <meshBasicMaterial
              color={new Color(tongue.color).multiplyScalar(tongue.intensity)}
              transparent
              opacity={tongue.opacity}
              blending={AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Stocking({ x, color, cuff }: { x: number; color: string; cuff: string }) {
  return (
    <group position={[x, 4.2, -6.72]} rotation-z={0.04}>
      <mesh position={[0, -0.12, 0]}>
        <boxGeometry args={[0.5, 0.22, 0.16]} />
        <meshStandardMaterial color={cuff} roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.6, 0]}>
        <boxGeometry args={[0.42, 0.78, 0.12]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[0.14, -1.0, 0]} rotation-z={0.1}>
        <boxGeometry args={[0.66, 0.32, 0.12]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Garland() {
  const curve = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(-2.9, 4.45, -6.7),
        new Vector3(-1.5, 4.0, -6.68),
        new Vector3(0, 4.35, -6.7),
        new Vector3(1.5, 4.0, -6.68),
        new Vector3(2.9, 4.45, -6.7),
      ]),
    [],
  );
  const berries = useMemo(() => Array.from({ length: 11 }, (_, i) => curve.getPoint((i + 0.5) / 11)), [curve]);
  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 48, 0.1, 6, false]} />
        <meshStandardMaterial color="#24543a" roughness={0.9} />
      </mesh>
      {berries.map((point, index) => (
        <mesh key={index} position={[point.x, point.y - 0.06, point.z + 0.08]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#d8322d" emissive="#ff3a2a" emissiveIntensity={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Candle({ x }: { x: number }) {
  return (
    <group position={[x, 4.55, -7.5]}>
      <mesh position-y={0.3}>
        <cylinderGeometry args={[0.1, 0.1, 0.6, 12]} />
        <meshStandardMaterial color="#f6ecd8" roughness={0.7} />
      </mesh>
      <mesh position-y={0.68}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color={new Color("#ffc46b").multiplyScalar(4)} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Hearth() {
  const family = useCircle("family");
  const target = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const hoverRing = useRef<Mesh>(null);
  const flameScale = useRef(1);
  const bricks = useMemo(() => brickTexture(), []);

  const { fire } = useControls("Hearth", {
    fire: { value: 55, min: 0, max: 200 },
    flare: button(() => useStage.getState().flareFire()),
  });

  useEffect(() => (target.current ? registerTarget("hearth", target.current, 1.8) : undefined), []);

  useFrame(({ clock }, delta) => {
    const { scene, hand } = useStage.getState();
    const flare = flareAmount(scene.fireFlareAt, performance.now());
    const hovered = hand.hoverTarget === "hearth" ? 1 : 0;
    const goal = 1 + flare * 0.9 + hovered * 0.15;
    flameScale.current += (goal - flameScale.current) * Math.min(1, delta * 10);
    if (light.current) {
      light.current.intensity = fire * (0.85 + flicker(clock.elapsedTime, 0.3) * 0.12) * (1 + flare * 2.2 + hovered * 0.2);
    }
    if (hoverRing.current) {
      const material = hoverRing.current.material as MeshBasicMaterial;
      material.opacity += ((hovered ? 0.55 : 0) + flare * 0.6 - material.opacity) * Math.min(1, delta * 8);
    }
  });

  const [hx, , hz] = HEARTH.position;
  const pillarWidth = (SURROUND.width - OPENING.width) / 2;
  const surroundZ = -8 + SURROUND.depth / 2;
  const cuffs = ["#c9a227", "#ffffff", "#ffffff"];
  return (
    <group position={[hx, 0, 0]}>
      {/* Brick surround: two pillars and a lintel around the opening. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (OPENING.width / 2 + pillarWidth / 2), SURROUND.height / 2, surroundZ]}>
          <boxGeometry args={[pillarWidth, SURROUND.height, SURROUND.depth]} />
          <meshStandardMaterial map={bricks} roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, (OPENING.height + SURROUND.height) / 2, surroundZ]}>
        <boxGeometry args={[OPENING.width, SURROUND.height - OPENING.height, SURROUND.depth]} />
        <meshStandardMaterial map={bricks} roughness={0.95} />
      </mesh>
      {/* Firebox interior, drawn inside-out so only its back and sides show through the opening. */}
      <mesh position={[0, OPENING.height / 2, surroundZ]}>
        <boxGeometry args={[OPENING.width, OPENING.height, SURROUND.depth - 0.02]} />
        <meshStandardMaterial color="#2a1a12" roughness={1} side={BackSide} />
      </mesh>
      <mesh position={[0, 4.42, -7.38]}>
        <boxGeometry args={[6.0, 0.25, 1.3]} />
        <meshStandardMaterial color="#5a3a24" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.09, hz + 0.9]}>
        <boxGeometry args={[6.0, 0.18, 1.5]} />
        <meshStandardMaterial color="#6f6660" roughness={0.8} />
      </mesh>
      <mesh ref={hoverRing} position={[0, 0.19, hz + 0.9]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.6, 1.85, 48]} />
        <meshBasicMaterial color={new Color("#ffb45e").multiplyScalar(2.5)} transparent opacity={0} toneMapped={false} />
      </mesh>
      {/* Logs and embers. */}
      {[
        [-0.3, 0.28, -7.45, 0.35],
        [0.35, 0.28, -7.5, -0.3],
        [0, 0.52, -7.55, 0.05],
      ].map(([x, y, z, yaw], index) => (
        <mesh key={index} position={[x, y, z]} rotation={[0, yaw, Math.PI / 2]}>
          <cylinderGeometry args={[0.17, 0.2, 1.5, 8]} />
          <meshStandardMaterial color="#4a2c1a" emissive="#ff4a10" emissiveIntensity={0.25} roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 0.2, -7.4]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.9, 24]} />
        <meshBasicMaterial color={new Color("#ff5a14").multiplyScalar(1.6)} toneMapped={false} />
      </mesh>
      <group position={[0, 0.45, -7.45]}>
        <Flame flameScale={flameScale} />
      </group>
      <pointLight ref={light} position={[0, 1.4, -6.5]} color="#ff8a3d" intensity={fire} distance={0} decay={1.7} />
      <group ref={target} position={[0, 1.3, -7.2]} />
      <Garland />
      <Candle x={-2.4} />
      <Candle x={2.4} />
      {family.map((profile, index) => (
        <Stocking
          key={profile.id}
          x={(index - (family.length - 1) / 2) * 1.6}
          color={profile.id === "wife" ? "#b8322e" : (profile.colors[0] ?? "#b8322e")}
          cuff={cuffs[index % cuffs.length] ?? "#ffffff"}
        />
      ))}
    </group>
  );
}
