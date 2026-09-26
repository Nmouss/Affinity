"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { FamilyProfile } from "@/types/domain";
import type { CharacterLook, EyeType } from "@/types/character";
import { BLANK_LOOK, STARTER_LOOKS } from "@/lib/people/starters";
import type { SpriteMood } from "@/types/stage";
import {
  characterForLook,
  characterTuning,
  createPose,
  poseFor,
  type CharacterMotion,
  type Pose,
  type PoseInput,
} from "./characterPose";

// Shared procedural geometry keeps every character lightweight: every instance reuses the same
// GPU buffers, while per-look materials, offsets and small geometry picks provide the silhouette.
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

/** Where the lathe body's surface sits at a given (x, y), so head accessories and brows sit flush. */
function surfaceZ(x: number, y: number): number {
  const radius = radiusAt(y);
  return Math.sqrt(Math.max(0.005, radius * radius - x * x)) + 0.01;
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

// --- Mouths (pose "smile" = show the look's mouth type; "open"/"worried" still win) -------------

const smileGeometry = curveGeometry([
  [-0.063, 0.016, 0],
  [0, -0.014, 0.004],
  [0.063, 0.016, 0],
]);
const grinGeometry = curveGeometry(
  [
    [-0.075, 0.022, 0],
    [0, -0.028, 0.006],
    [0.075, 0.022, 0],
  ],
  0.013,
);
const flatGeometry = curveGeometry(
  [
    [-0.04, 0, 0],
    [0, 0, 0.002],
    [0.04, 0, 0],
  ],
  0.01,
);
const catArcLeftGeometry = curveGeometry(
  [
    [-0.05, 0.006, 0],
    [-0.032, -0.012, 0.003],
    [-0.014, 0.006, 0],
  ],
  0.009,
);
const catArcRightGeometry = curveGeometry(
  [
    [0.014, 0.006, 0],
    [0.032, -0.012, 0.003],
    [0.05, 0.006, 0],
  ],
  0.009,
);
const oMouthGeometry = new THREE.TorusGeometry(0.02, 0.011, 8, 16);
const concernGeometry = curveGeometry([
  [-0.054, -0.012, 0],
  [0, 0.009, 0.004],
  [0.054, -0.012, 0],
]);

// --- Eyes: a tiny lid line for "sleepy" -----------------------------------------------------------
const eyelidLineGeometry = curveGeometry(
  [
    [-0.02, 0, 0],
    [0, 0.004, 0.003],
    [0.02, 0, 0],
  ],
  0.006,
);

// --- Brows -----------------------------------------------------------------------------------------
const browSoftGeometry = curveGeometry(
  [
    [-0.058, 0, 0],
    [0, 0.007, 0.005],
    [0.058, 0, 0],
  ],
  0.008,
);
const browBoldGeometry = curveGeometry(
  [
    [-0.068, 0.003, 0],
    [0, 0.006, 0.006],
    [0.068, 0.003, 0],
  ],
  0.016,
);
const browRaisedGeometry = curveGeometry(
  [
    [-0.058, 0.004, 0],
    [0, 0.026, 0.006],
    [0.058, 0.004, 0],
  ],
  0.01,
);

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

const glintMaterial = new THREE.MeshBasicMaterial({ color: "#fff7e6", toneMapped: false });
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

/** One eyeball's geometry/decoration, keyed off EyeType. `sizeMul` comes from look.eyes.size. */
function EyeShape({
  type,
  material,
  sizeMul,
}: {
  type: EyeType;
  material: THREE.Material;
  sizeMul: number;
}) {
  switch (type) {
    case "dot":
      return <mesh geometry={sphere} material={material} scale={[0.024 * sizeMul, 0.024 * sizeMul, 0.02 * sizeMul]} />;
    case "sleepy":
      return (
        <group>
          <mesh
            geometry={sphere}
            material={material}
            position={[0, -0.006, 0]}
            scale={[0.034 * sizeMul, 0.02 * sizeMul, 0.02 * sizeMul]}
          />
          <mesh
            geometry={eyelidLineGeometry}
            material={material}
            position={[0, 0.009, 0.019]}
            scale={[sizeMul, sizeMul, sizeMul]}
          />
        </group>
      );
    case "sparkle":
      return (
        <group>
          <mesh geometry={sphere} material={material} scale={[0.04 * sizeMul, 0.05 * sizeMul, 0.024 * sizeMul]} />
          <mesh
            geometry={sphere}
            material={glintMaterial}
            position={[-0.009, 0.017, 0.021]}
            scale={[0.009 * sizeMul, 0.01 * sizeMul, 0.005 * sizeMul]}
          />
          <mesh
            geometry={sphere}
            material={glintMaterial}
            position={[0.008, -0.012, 0.02]}
            scale={[0.006 * sizeMul, 0.007 * sizeMul, 0.004 * sizeMul]}
          />
        </group>
      );
    case "wide":
      return (
        <group>
          <mesh geometry={sphere} material={material} scale={[0.045 * sizeMul, 0.045 * sizeMul, 0.024 * sizeMul]} />
          <mesh
            geometry={sphere}
            material={glintMaterial}
            position={[-0.01, 0.016, 0.021]}
            scale={[0.009 * sizeMul, 0.01 * sizeMul, 0.005 * sizeMul]}
          />
        </group>
      );
    case "oval":
    default:
      return (
        <group>
          <mesh geometry={sphere} material={material} scale={[0.032 * sizeMul, 0.047 * sizeMul, 0.021 * sizeMul]} />
          <mesh
            geometry={sphere}
            material={glintMaterial}
            position={[-0.008, 0.015, 0.018]}
            scale={[0.008 * sizeMul, 0.009 * sizeMul, 0.004 * sizeMul]}
          />
        </group>
      );
  }
}

/** Above the eyes, following eye spacing/height plus the brow type's own shape and placement. */
function Brows({
  type,
  spacing,
  heightOffset,
  material,
}: {
  type: CharacterLook["brows"]["type"];
  spacing: number;
  heightOffset: number;
  material: THREE.Material;
}) {
  if (type === "none") return null;
  const geometry = type === "bold" ? browBoldGeometry : type === "raised" ? browRaisedGeometry : browSoftGeometry;
  const y = 1.63 + 0.1 + heightOffset + (type === "raised" ? 0.02 : 0);
  return (
    <>
      {[-1, 1].map((side) => {
        const x = side * spacing;
        return <mesh key={side} geometry={geometry} material={material} position={[x, y, surfaceZ(x, y) + 0.004]} />;
      })}
    </>
  );
}

function Details({ look, accent }: { look: CharacterLook; accent: THREE.Material }) {
  const accessory = look.accessory.type;
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
  if (accessory === "bow") {
    return (
      <group position={[0.33, 1.98, 0.1]} rotation={[0.1, -0.1, -0.28]}>
        <Pebble position={[-0.1, 0, 0]} scale={[0.15, 0.1, 0.055]} material={accent} />
        <Pebble position={[0.1, 0, 0]} scale={[0.15, 0.1, 0.055]} material={accent} />
        <Pebble position={[0, 0, 0.035]} scale={[0.065, 0.065, 0.06]} material={accent} />
      </group>
    );
  }
  if (accessory === "glasses") {
    const spacing = 0.16 + look.eyes.spacing * 0.05;
    const y = 1.63 + look.eyes.height * 0.06;
    const z = surfaceZ(spacing, y) + 0.02;
    const bridgeLength = Math.max(0.01, spacing * 2 - 0.09);
    return (
      <group>
        {[-1, 1].map((side) => (
          <mesh key={side} material={accent} position={[side * spacing, y, z]}>
            <torusGeometry args={[0.045, 0.008, 8, 20]} />
          </mesh>
        ))}
        <mesh material={accent} position={[0, y, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.006, 0.006, bridgeLength, 8]} />
        </mesh>
      </group>
    );
  }
  if (accessory === "beanie") {
    return (
      <group>
        <mesh geometry={sphere} material={accent} position={[0, 2, 0]} scale={[0.44, 0.24, 0.44]} />
        <Pebble position={[0, 2.17, 0]} scale={[0.09, 0.09, 0.09]} material={accent} />
      </group>
    );
  }
  if (accessory === "flower") {
    return (
      <group position={[0.33, 1.98, 0.1]} rotation={[0.1, -0.1, 0]}>
        {Array.from({ length: 5 }, (_, index) => {
          const angle = (index / 5) * Math.PI * 2;
          return (
            <Pebble
              key={index}
              position={[Math.cos(angle) * 0.045, Math.sin(angle) * 0.045, 0.012]}
              scale={[0.03, 0.045, 0.02]}
              material={accent}
            />
          );
        })}
        <Pebble position={[0, 0, 0.024]} scale={[0.028, 0.028, 0.022]} material={accent} />
      </group>
    );
  }
  if (accessory === "antenna") {
    return (
      <group position={[0, 2.13, -0.02]}>
        <mesh material={accent} position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 0.24, 8]} />
        </mesh>
        <mesh position={[0, 0.25, 0]}>
          <sphereGeometry args={[0.045, 12, 10]} />
          <meshStandardMaterial color={look.accessory.color} emissive={look.accessory.color} emissiveIntensity={0.9} toneMapped={false} />
        </mesh>
      </group>
    );
  }
  return null;
}

export interface CharacterModelProps {
  profile: FamilyProfile;
  mood: MutableRefObject<SpriteMood>;
  gaze: MutableRefObject<{ x: number; y: number }>;
  /** Locomotion from SpriteToken (walk speed, gait, jump and landing times). */
  motion?: MutableRefObject<CharacterMotion>;
  /** How the person looks (People Maker). Falls back to that profile's starter, then BLANK_LOOK. */
  look?: CharacterLook;
}

/** The model origin sits at the soles, so the character stands on whatever y it is placed at. */
const BASE_Y = 0;

// Each foot group's pivot sits at the ankle; the foot mesh is offset down and forward from it
// (matching the old fixed mesh position) so a pitch rotation lifts the toe about the ankle
// instead of about the mesh's own center.
const ANKLE_Y = 0.2;
const ANKLE_Z = 0.02;
const FOOT_MESH_OFFSET: [number, number, number] = [0, 0.16 - ANKLE_Y, 0.1 - ANKLE_Z];

export function CharacterModel({ profile, mood, gaze, motion, look }: CharacterModelProps) {
  const actor = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const twist = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftFoot = useRef<THREE.Group>(null);
  const rightFoot = useRef<THREE.Group>(null);
  const accessory = useRef<THREE.Group>(null);
  const lookMouth = useRef<THREE.Group>(null);
  const openMouth = useRef<THREE.Mesh>(null);
  const worriedMouth = useRef<THREE.Mesh>(null);
  const time = useRef(0);
  const stateTime = useRef(0);
  const previousMood = useRef<SpriteMood>(mood.current);

  const resolvedLook = look ?? STARTER_LOOKS[profile.id] ?? BLANK_LOOK;
  const character = characterForLook(resolvedLook, profile.id);

  const springs = useRef({
    lift: spring(),
    squash: spring(1),
    lean: spring(),
    nod: spring(),
    twist: spring(),
    armLeftRaise: spring(0.28),
    armRightRaise: spring(0.28),
    armLeftSwing: spring(),
    armRightSwing: spring(),
    footLeftLift: spring(),
    footLeftPitch: spring(),
    footLeftForward: spring(),
    footRightLift: spring(),
    footRightPitch: spring(),
    footRightForward: spring(),
  });
  // Reused every frame so poseFor and the driver below never allocate.
  const poseInput = useRef<PoseInput>({
    mood: mood.current,
    character,
    time: 0,
    sinceMood: 0,
    speed: 0,
    gaitPhase: 0,
    sinceJump: Infinity,
    sinceLand: Infinity,
    dragVelocityX: 0,
  });
  const pose = useRef<Pose>(createPose());

  const materials = useMemo(() => {
    const body = new THREE.Color(resolvedLook.bodyColor);
    return {
      body: new THREE.MeshStandardMaterial({ color: body, roughness: 0.82, emissive: body, emissiveIntensity: 0.025 }),
      accent: new THREE.MeshStandardMaterial({ color: resolvedLook.accessory.color, roughness: 0.78 }),
      face: new THREE.MeshStandardMaterial({ color: resolvedLook.skin, roughness: 0.96, side: THREE.DoubleSide }),
      eye: new THREE.MeshStandardMaterial({ color: resolvedLook.eyes.color, roughness: 0.3 }),
      brow: new THREE.MeshStandardMaterial({
        color: new THREE.Color(resolvedLook.eyes.color).lerp(new THREE.Color("#1a120b"), 0.45),
        roughness: 0.5,
      }),
      cheek: new THREE.MeshStandardMaterial({ color: resolvedLook.cheeks.color, roughness: 0.9 }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    resolvedLook.bodyColor,
    resolvedLook.accessory.color,
    resolvedLook.skin,
    resolvedLook.eyes.color,
    resolvedLook.cheeks.color,
  ]);

  useEffect(
    () => () => {
      materials.body.dispose();
      materials.accent.dispose();
      materials.face.dispose();
      materials.eye.dispose();
      materials.brow.dispose();
      materials.cheek.dispose();
    },
    [materials],
  );

  const eyeSizeMul = 1 + 0.3 * resolvedLook.eyes.size;
  const eyeSpacing = 0.16 + resolvedLook.eyes.spacing * 0.05;
  const lookMouthGeometry =
    resolvedLook.mouth.type === "grin"
      ? grinGeometry
      : resolvedLook.mouth.type === "flat"
        ? flatGeometry
        : resolvedLook.mouth.type === "smile"
          ? smileGeometry
          : null; // "o" and "cat" are built from primitives directly below

  useFrame((state, rawDelta) => {
    if (
      !actor.current ||
      !torso.current ||
      !twist.current ||
      !eyes.current ||
      !leftArm.current ||
      !rightArm.current ||
      !leftFoot.current ||
      !rightFoot.current
    )
      return;
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
    const elapsed = state.clock.elapsedTime;

    const blinkTime = (t + Math.sin(t * 0.15) * 0.4) % 4.7;
    eyes.current.scale.y = 1 - 0.95 * pulse(blinkTime, 4.52, 0.065);
    eyes.current.position.x = THREE.MathUtils.damp(eyes.current.position.x, gaze.current.x * 0.035, 12, delta);

    // Fill the reused pose input from mood, character, locomotion and clock state, then let
    // poseFor (owned by the pose track) turn it into joint targets.
    const input = poseInput.current;
    input.mood = activity;
    input.character = character;
    input.time = t;
    input.sinceMood = since;
    input.speed = motion?.current.speed ?? 0;
    input.gaitPhase = motion?.current.gaitPhase ?? 0;
    input.dragVelocityX = motion?.current.dragVelocityX ?? 0;
    const jumpAt = motion?.current.jumpAt ?? null;
    input.sinceJump = jumpAt === null ? Infinity : elapsed - jumpAt;
    const landAt = motion?.current.landAt ?? null;
    input.sinceLand = landAt === null ? Infinity : elapsed - landAt;
    const target = poseFor(input, pose.current);

    eyes.current.position.y = THREE.MathUtils.damp(
      eyes.current.position.y,
      1.63 + resolvedLook.eyes.height * 0.06 + gaze.current.y * 0.025 + target.eyeLift * 0.02,
      12,
      delta,
    );

    const values = springs.current;
    actor.current.position.y = BASE_Y + advance(values.lift, target.lift, delta, 280, 27);
    actor.current.rotation.y = target.spin; // whole-body spin is applied directly, never sprung
    actor.current.scale.setScalar(character.scale * characterTuning.scale);

    const scaleY = advance(values.squash, target.squash, delta, 150, 13);
    torso.current.scale.set(character.width / Math.sqrt(scaleY), scaleY, 1 / Math.sqrt(scaleY));
    torso.current.rotation.z = advance(values.lean, target.lean, delta, 100, 15);
    torso.current.rotation.x = advance(values.nod, target.nod, delta, 130, 16);
    twist.current.rotation.y = advance(values.twist, target.twist, delta, 120, 15);

    // raise is mirrored per side (today's rest pose: left -0.28, right +0.28); swing rotates
    // about x, and since the arm hangs from the shoulder along -y, a positive swing has to be a
    // negative x rotation to swing the hand toward the character's front (+z).
    leftArm.current.rotation.z = -advance(values.armLeftRaise, target.armLeft.raise, delta, 170, 16);
    rightArm.current.rotation.z = advance(values.armRightRaise, target.armRight.raise, delta, 170, 16);
    leftArm.current.rotation.x = -advance(values.armLeftSwing, target.armLeft.swing, delta, 170, 16);
    rightArm.current.rotation.x = -advance(values.armRightSwing, target.armRight.swing, delta, 170, 16);

    // Same sign as arm swing: the foot mesh sits forward (+z) of its ankle pivot, so a positive
    // pitch (toe up) has to be a negative x rotation to raise that +z point. Lift is clamped at 0
    // so an under-shooting spring never sinks the sole into the floor.
    leftFoot.current.position.y = ANKLE_Y + Math.max(0, advance(values.footLeftLift, target.footLeft.lift, delta, 260, 22));
    leftFoot.current.position.z = ANKLE_Z + advance(values.footLeftForward, target.footLeft.forward, delta, 260, 22);
    leftFoot.current.rotation.x = -advance(values.footLeftPitch, target.footLeft.pitch, delta, 260, 22);
    rightFoot.current.position.y = ANKLE_Y + Math.max(0, advance(values.footRightLift, target.footRight.lift, delta, 260, 22));
    rightFoot.current.position.z = ANKLE_Z + advance(values.footRightForward, target.footRight.forward, delta, 260, 22);
    rightFoot.current.rotation.x = -advance(values.footRightPitch, target.footRight.pitch, delta, 260, 22);

    if (accessory.current) accessory.current.rotation.z = -values.lean.velocity * 0.025;

    const mouthOpen = target.mouth === "open";
    openMouth.current!.visible = mouthOpen;
    openMouth.current!.scale.y = 0.018 + Math.min(1, target.mouthOpen) * 0.05;
    worriedMouth.current!.visible = target.mouth === "worried";
    if (lookMouth.current) lookMouth.current.visible = target.mouth === "smile";
    materials.body.emissiveIntensity = target.glow;
  });

  return (
    <group ref={actor} position-y={BASE_Y}>
      <group ref={torso} position-y={0.34}>
        <group ref={twist} position-y={-0.34}>
          <mesh geometry={bodyGeometry} material={materials.body} castShadow receiveShadow />
          <mesh geometry={faceGeometry} material={materials.face} />
          <group ref={eyes} position={[0, 1.63, 0.454]}>
            {[-1, 1].map((side) => (
              <group key={side} position={[side * eyeSpacing, 0, 0]}>
                <EyeShape type={resolvedLook.eyes.type} material={materials.eye} sizeMul={eyeSizeMul} />
              </group>
            ))}
          </group>
          <Brows
            type={resolvedLook.brows.type}
            spacing={eyeSpacing}
            heightOffset={resolvedLook.brows.height * 0.05}
            material={materials.brow}
          />
          {resolvedLook.cheeks.on &&
            [-1, 1].map((side) => (
              <Pebble key={side} position={[side * 0.233, 1.49, 0.435]} scale={[0.052, 0.023, 0.012]} material={materials.cheek} />
            ))}
          <group ref={lookMouth} position={[0, 1.46, 0.499]}>
            {lookMouthGeometry && <mesh geometry={lookMouthGeometry} material={mouthMaterial} />}
            {resolvedLook.mouth.type === "o" && <mesh geometry={oMouthGeometry} material={mouthMaterial} />}
            {resolvedLook.mouth.type === "cat" && (
              <>
                <mesh geometry={catArcLeftGeometry} material={mouthMaterial} />
                <mesh geometry={catArcRightGeometry} material={mouthMaterial} />
              </>
            )}
          </group>
          <mesh ref={worriedMouth} geometry={concernGeometry} material={mouthMaterial} position={[0, 1.46, 0.499]} visible={false} />
          <mesh ref={openMouth} geometry={sphere} material={mouthMaterial} position={[0, 1.46, 0.502]} scale={[0.042, 0.04, 0.008]} visible={false} />
          <group ref={leftArm} position={[-0.49, 1.24, 0.105]}>
            <mesh geometry={armGeometry} material={materials.body} castShadow />
          </group>
          <group ref={rightArm} position={[0.49, 1.24, 0.105]}>
            <mesh geometry={armGeometry} material={materials.body} castShadow />
          </group>
          <group ref={accessory}>
            <Details look={resolvedLook} accent={materials.accent} />
          </group>
        </group>
      </group>
      <group ref={leftFoot} position={[-0.205, ANKLE_Y, ANKLE_Z]}>
        <mesh geometry={footGeometry} material={materials.body} position={FOOT_MESH_OFFSET} scale={[0.132, 0.175, 0.2]} castShadow />
      </group>
      <group ref={rightFoot} position={[0.205, ANKLE_Y, ANKLE_Z]}>
        <mesh geometry={footGeometry} material={materials.body} position={FOOT_MESH_OFFSET} scale={[0.132, 0.175, 0.2]} castShadow />
      </group>
    </group>
  );
}
