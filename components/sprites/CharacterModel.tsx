"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { FamilyProfile } from "@/types/domain";
import type { SpriteMood } from "@/types/stage";

// Shared procedural geometry keeps the three characters lightweight: every instance reuses the
// same GPU buffers, while profile color and accessories provide their individual silhouettes.
const sphere = new THREE.SphereGeometry(1, 24, 18);
const footGeometry = (() => {
  const geometry = sphere.clone();
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    positions.setY(index, y + 0.55 * Math.max(0, y) ** 2);
  }
  geometry.computeVertexNormals();
  return geometry;
})();

const profileCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0.29, 0),
  new THREE.Vector3(0.27, 0.36, 0),
  new THREE.Vector3(0.49, 0.56, 0),
  new THREE.Vector3(0.56, 0.88, 0),
  new THREE.Vector3(0.53, 1.18, 0),
  new THREE.Vector3(0.48, 1.52, 0),
  new THREE.Vector3(0.44, 1.81, 0),
  new THREE.Vector3(0.3, 2.035, 0),
  new THREE.Vector3(0, 2.13, 0),
]);
const outline = profileCurve.getPoints(64);
const bodyGeometry = new THREE.LatheGeometry(
  outline.map((point) => new THREE.Vector2(Math.max(0, point.x), point.y)),
  48,
);
const armGeometry = new THREE.LatheGeometry(
  new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.445, 0),
    new THREE.Vector3(0.09, -0.405, 0),
    new THREE.Vector3(0.115, -0.33, 0),
    new THREE.Vector3(0.09, -0.19, 0),
    new THREE.Vector3(0.112, -0.06, 0),
    new THREE.Vector3(0.085, 0.03, 0),
    new THREE.Vector3(0, 0.07, 0),
  ])
    .getPoints(24)
    .map((point) => new THREE.Vector2(Math.max(0, point.x), point.y)),
  24,
);

function radiusAt(y: number): number {
  for (let index = 1; index < outline.length; index += 1) {
    if (outline[index]!.y >= y) {
      const before = outline[index - 1]!;
      const after = outline[index]!;
      return THREE.MathUtils.lerp(before.x, after.x, (y - before.y) / Math.max(0.0001, after.y - before.y));
    }
  }
  return 0.01;
}

const faceGeometry = (() => {
  const positions: number[] = [];
  const indices: number[] = [];
  const rings = 14;
  const segments = 40;
  for (let ring = 0; ring <= rings; ring += 1) {
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const radiusScale = ring / rings;
      const x = Math.cos(angle) * 0.355 * radiusScale;
      const y = 1.59 + Math.sin(angle) * 0.37 * radiusScale;
      const radius = radiusAt(y);
      const z = Math.sqrt(Math.max(0.005, radius * radius - x * x)) + 0.007;
      positions.push(x, y, z);
      if (ring < rings && segment < segments) {
        const a = ring * (segments + 1) + segment;
        const b = a + segments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
})();

function curveGeometry(points: Array<[number, number, number]>, radius = 0.011): THREE.TubeGeometry {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))),
    20,
    radius,
    6,
    false,
  );
}

const smileGeometry = curveGeometry([
  [-0.063, 0.016, 0],
  [0, -0.014, 0.004],
  [0.063, 0.016, 0],
]);
const concernGeometry = curveGeometry([
  [-0.054, -0.012, 0],
  [0, 0.009, 0.004],
  [0.054, -0.012, 0],
]);
const scarfGeometry = curveGeometry(
  [
    [-0.43, 1.1, 0.35],
    [-0.26, 1.045, 0.49],
    [0, 1.025, 0.555],
    [0.25, 1.055, 0.49],
    [0.44, 1.13, 0.32],
  ],
  0.047,
);
const scarfTailGeometry = curveGeometry(
  [
    [0.3, 1.055, 0.48],
    [0.29, 0.89, 0.55],
    [0.35, 0.78, 0.52],
  ],
  0.055,
);

const faceMaterial = new THREE.MeshStandardMaterial({ color: "#ffedce", roughness: 0.96, side: THREE.DoubleSide });
const eyeMaterial = new THREE.MeshStandardMaterial({ color: "#302c2b", roughness: 0.3 });
const glintMaterial = new THREE.MeshBasicMaterial({ color: "#fff7e6", toneMapped: false });
const blushMaterial = new THREE.MeshStandardMaterial({ color: "#eab7a1", roughness: 0.9 });
const mouthMaterial = new THREE.MeshStandardMaterial({ color: "#805d4d", roughness: 0.9 });

interface SpringValue {
  value: number;
  velocity: number;
}

function spring(value = 0): SpringValue {
  return { value, velocity: 0 };
}

function advance(current: SpringValue, target: number, delta: number, stiffness = 150, damping = 18): number {
  const steps = Math.max(1, Math.ceil(delta / 0.008));
  const step = delta / steps;
  for (let index = 0; index < steps; index += 1) {
    current.velocity += ((target - current.value) * stiffness - current.velocity * damping) * step;
    current.value += current.velocity * step;
  }
  return current.value;
}

function pulse(time: number, at: number, width: number): number {
  return Math.exp(-1 * ((time - at) / width) ** 2);
}

function Pebble({
  position,
  scale,
  material,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  material: THREE.Material;
}) {
  return <mesh geometry={sphere} material={material} position={position} scale={scale} />;
}

type Accessory = "scarf" | "bow" | "dinosaur";

function Details({ accessory, accent }: { accessory: Accessory; accent: THREE.Material }) {
  if (accessory === "scarf") {
    return (
      <group>
        <mesh geometry={scarfGeometry} material={accent} />
        <mesh geometry={scarfTailGeometry} material={accent} />
        <Pebble position={[0.37, 1.99, -0.04]} scale={[0.16, 0.165, 0.155]} material={accent} />
        <mesh material={accent} position={[0.395, 2, 0.102]} rotation={[0, 0.2, -0.3]}>
          <torusGeometry args={[0.092, 0.009, 6, 24]} />
        </mesh>
      </group>
    );
  }
  if (accessory === "dinosaur") {
    return (
      <group>
        {[0, 1, 2].map((index) => (
          <Pebble
            key={index}
            position={[0, 2.11 - index * 0.095, -0.07 - index * 0.19]}
            scale={[0.085, 0.12 - index * 0.012, 0.075]}
            material={accent}
          />
        ))}
        <Pebble position={[0, 0.6, -0.52]} scale={[0.14, 0.13, 0.27]} material={accent} />
      </group>
    );
  }
  return (
    <group position={[0.33, 1.98, 0.1]} rotation={[0.1, -0.1, -0.28]}>
      <Pebble position={[-0.1, 0, 0]} scale={[0.15, 0.1, 0.055]} material={accent} />
      <Pebble position={[0.1, 0, 0]} scale={[0.15, 0.1, 0.055]} material={accent} />
      <Pebble position={[0, 0, 0.035]} scale={[0.065, 0.065, 0.06]} material={accent} />
    </group>
  );
}

export interface CharacterModelProps {
  profile: FamilyProfile;
  mood: MutableRefObject<SpriteMood>;
  gaze: MutableRefObject<{ x: number; y: number }>;
}

const BASE_Y = -0.8;

export function CharacterModel({ profile, mood, gaze }: CharacterModelProps) {
  const actor = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const feet = useRef<THREE.Group>(null);
  const accessory = useRef<THREE.Group>(null);
  const closedMouth = useRef<THREE.Mesh>(null);
  const openMouth = useRef<THREE.Mesh>(null);
  const worriedMouth = useRef<THREE.Mesh>(null);
  const time = useRef(0);
  const stateTime = useRef(0);
  const previousMood = useRef<SpriteMood>(mood.current);
  const springs = useRef({
    squash: spring(1),
    lean: spring(),
    nod: spring(),
    lift: spring(),
    left: spring(-0.28),
    right: spring(0.28),
  });

  const character = useMemo(() => {
    if (profile.id === "wife") return { accessory: "scarf" as const, scale: 0.72, width: 1, energy: 0.72, phase: 0 };
    if (profile.id === "son") return { accessory: "dinosaur" as const, scale: 0.63, width: 1.05, energy: 1.2, phase: 1.6 };
    return { accessory: "bow" as const, scale: 0.64, width: 0.98, energy: 1, phase: 3.3 };
  }, [profile.id]);

  const materials = useMemo(() => {
    const core = new THREE.Color(profile.colors[0] ?? "#ffffff");
    const accentColor = new THREE.Color(profile.colors[1] ?? profile.colors[0] ?? "#d8b37d");
    const body = core.clone().lerp(accentColor, profile.id === "wife" ? 0.32 : 0.12);
    return {
      skin: new THREE.MeshStandardMaterial({ color: body, roughness: 0.82, emissive: body, emissiveIntensity: 0.025 }),
      accent: new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.78 }),
    };
  }, [profile.colors, profile.id]);

  useEffect(
    () => () => {
      materials.skin.dispose();
      materials.accent.dispose();
    },
    [materials],
  );

  useFrame((_, rawDelta) => {
    if (!actor.current || !torso.current || !eyes.current || !leftArm.current || !rightArm.current || !feet.current) return;
    const delta = Math.min(rawDelta, 0.05);
    const activity = mood.current;
    time.current += delta;
    if (activity !== previousMood.current) {
      previousMood.current = activity;
      stateTime.current = 0;
    }
    stateTime.current += delta;

    const t = time.current + character.phase;
    const since = stateTime.current;
    const beat = (since * (profile.id === "son" ? 1.1 : 0.9)) % 3.8;
    const phrase = pulse(beat, 0.65, 0.32) + 0.65 * pulse(beat, 1.65, 0.27) + 0.4 * pulse(beat, 2.35, 0.19);
    const speaking = activity === "speaking";
    const listening = activity === "listening" || activity === "seated";
    const happy = activity === "happy" || activity === "celebrating";

    const blinkTime = (t + Math.sin(t * 0.15) * 0.4) % 4.7;
    eyes.current.scale.y = 1 - 0.95 * pulse(blinkTime, 4.52, 0.065);
    eyes.current.position.x = THREE.MathUtils.damp(eyes.current.position.x, gaze.current.x * 0.035, 12, delta);
    eyes.current.position.y = THREE.MathUtils.damp(eyes.current.position.y, 1.63 + gaze.current.y * 0.025, 12, delta);

    let armLeft = -0.28;
    let armRight = 0.28;
    let lean = Math.sin(t * 0.9) * 0.013;
    let nod = 0;
    let squash = 1 + Math.sin(t * 1.5) * 0.01;
    let lift = 0;

    if (activity === "hovered") {
      armRight = 2.28 + Math.sin(since * 9) * 0.16;
      lean = -0.035;
    }
    if (speaking) {
      armRight = 0.45 + phrase * 0.82 * character.energy;
      armLeft = -0.28 - phrase * 0.19;
      nod = phrase * 0.035 * character.energy;
      lean = -0.018 + phrase * 0.03;
      squash += phrase * 0.012;
    }
    if (listening) {
      lean = -0.035;
      nod = 0.045 + pulse(beat, 2.9, 0.2) * 0.1;
      armRight = 0.32;
    }
    if (activity === "thinking" || activity === "scoring") {
      lean = -0.07;
      armRight = 2.3;
      nod = -0.025;
    }
    if (activity === "vetoing") {
      armRight = 2.05;
      lean = -0.04;
      nod = -0.025;
    }
    if (activity === "conceding" || activity === "sad") {
      nod = 0.1;
      squash = 0.97;
      armLeft = -0.18;
      armRight = 0.18;
    }
    if (activity === "held") {
      lift = 0.16;
      squash = 1.04;
      armLeft = -0.7;
      armRight = 0.7;
    }
    if (happy) {
      const local = (since + character.phase * 0.13) % 2.2;
      squash = 1 - 0.11 * pulse(local, 0.2, 0.12) + 0.065 * pulse(local, 0.47, 0.16) - 0.09 * pulse(local, 0.87, 0.1);
      lift = local > 0.3 && local < 0.88 ? Math.sin(((local - 0.3) / 0.58) * Math.PI) * 0.22 * character.energy : 0;
      armLeft = -2.05;
      armRight = 2.35;
      lean = Math.sin(t * 2.5) * 0.045;
    }

    const values = springs.current;
    actor.current.position.y = BASE_Y + advance(values.lift, lift, delta, 280, 27);
    const scaleY = advance(values.squash, squash, delta, 150, 13);
    torso.current.scale.set(character.width / Math.sqrt(scaleY), scaleY, 1 / Math.sqrt(scaleY));
    torso.current.rotation.z = advance(values.lean, lean, delta, 100, 15);
    torso.current.rotation.x = advance(values.nod, nod, delta, 130, 16);
    leftArm.current.rotation.z = advance(values.left, armLeft, delta, 105, 13);
    rightArm.current.rotation.z = advance(values.right, armRight, delta, 115, 13);
    rightArm.current.rotation.x = THREE.MathUtils.damp(rightArm.current.rotation.x, activity === "thinking" ? -0.28 : speaking ? -0.2 * phrase : 0, 7, delta);
    feet.current.rotation.x = THREE.MathUtils.damp(feet.current.rotation.x, activity === "held" ? -0.35 : 0, 8, delta);
    if (accessory.current) accessory.current.rotation.z = -values.lean.velocity * 0.025;

    const syllable = (Math.sin(t * 13) * 0.5 + 0.5) * phrase;
    const mouthOpen = speaking && syllable > 0.13;
    openMouth.current!.visible = mouthOpen;
    openMouth.current!.scale.y = 0.018 + Math.min(1, syllable) * 0.05;
    closedMouth.current!.visible = !mouthOpen && activity !== "sad" && activity !== "conceding";
    worriedMouth.current!.visible = activity === "sad" || activity === "conceding";
    materials.skin.emissiveIntensity = happy ? 0.12 : activity === "vetoing" ? 0.08 : 0.025;
  });

  return (
    <group ref={actor} position-y={BASE_Y} scale={character.scale}>
      <group ref={torso} position-y={0.34}>
        <group position-y={-0.34}>
          <mesh geometry={bodyGeometry} material={materials.skin} castShadow receiveShadow />
          <mesh geometry={faceGeometry} material={faceMaterial} />
          <group ref={eyes} position={[0, 1.63, 0.454]}>
            {[-1, 1].map((side) => (
              <group key={side} position={[side * 0.16, 0, 0]}>
                <mesh geometry={sphere} material={eyeMaterial} scale={[0.032, 0.047, 0.021]} />
                <mesh geometry={sphere} material={glintMaterial} position={[-0.008, 0.015, 0.018]} scale={[0.008, 0.009, 0.004]} />
              </group>
            ))}
          </group>
          {[-1, 1].map((side) => (
            <Pebble key={side} position={[side * 0.233, 1.49, 0.435]} scale={[0.052, 0.023, 0.012]} material={blushMaterial} />
          ))}
          <mesh ref={closedMouth} geometry={smileGeometry} material={mouthMaterial} position={[0, 1.46, 0.499]} />
          <mesh ref={worriedMouth} geometry={concernGeometry} material={mouthMaterial} position={[0, 1.46, 0.499]} visible={false} />
          <mesh ref={openMouth} geometry={sphere} material={mouthMaterial} position={[0, 1.46, 0.502]} scale={[0.042, 0.04, 0.008]} visible={false} />
          <group ref={leftArm} position={[-0.49, 1.24, 0.105]}>
            <mesh geometry={armGeometry} material={materials.skin} castShadow />
          </group>
          <group ref={rightArm} position={[0.49, 1.24, 0.105]}>
            <mesh geometry={armGeometry} material={materials.skin} castShadow />
          </group>
          <group ref={accessory}>
            <Details accessory={character.accessory} accent={materials.accent} />
          </group>
        </group>
      </group>
      <group ref={feet}>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            geometry={footGeometry}
            material={materials.skin}
            position={[side * 0.205, 0.16, 0.1]}
            scale={[0.132, 0.175, 0.2]}
            castShadow
          />
        ))}
      </group>
    </group>
  );
}
