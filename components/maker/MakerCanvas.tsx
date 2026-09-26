"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { MathUtils } from "three";
import { CharacterModel } from "@/components/sprites/CharacterModel";
import { createMotion, type CharacterMotion } from "@/components/sprites/characterPose";
import { useCircle, useLook } from "@/lib/people/roster";
import type { FamilyProfile } from "@/types/domain";
import type { Circle } from "@/types/character";
import type { SpriteMood } from "@/types/stage";
import type { DraftPerson, MakerStep } from "./flow";
import { reactions } from "./reactions";
import { addYaw, turntable } from "./turntable";

// The People Maker's one canvas: a Plaza (everyone wandering their corner) in every step but the
// editor, and a turntable with the draft person while editing. Kept intentionally simple — no
// postprocessing, cheap shadows — since this is a UI-heavy screen, not the family council stage.

const CORNERS: Record<Circle, { x: number; z: number }> = {
  family: { x: -2.6, z: 0.4 },
  friend: { x: 2.6, z: 0.4 },
};
const CORNER_RADIUS = 1.6;
const WALK_SPEED = 0.85;

function randomPointInCorner(circle: Circle): [number, number] {
  const corner = CORNERS[circle];
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * CORNER_RADIUS;
  return [corner.x + Math.cos(angle) * radius, corner.z + Math.sin(angle) * radius];
}

function WanderingCharacter({ profile, circle }: { profile: FamilyProfile; circle: Circle }) {
  const group = useRef<import("three").Group>(null);
  const mood = useRef<SpriteMood>("idle");
  const gaze = useRef({ x: 0, y: 0 });
  const motion = useRef<CharacterMotion>(createMotion());
  const look = useLook(profile.id);
  const start = useRef(randomPointInCorner(circle));
  const goal = useRef<[number, number]>(randomPointInCorner(circle));
  const position = useRef<[number, number]>(start.current);
  const idleUntil = useRef(0.5 + Math.random() * 2);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const g = group.current;
    if (!g) return;
    const [gx, gz] = goal.current;
    const [px, pz] = position.current;
    const dx = gx - px;
    const dz = gz - pz;
    const dist = Math.hypot(dx, dz);
    const t = state.clock.elapsedTime;

    if (t < idleUntil.current || dist < 0.08) {
      motion.current.speed = 0;
      if (dist < 0.08 && t >= idleUntil.current) {
        goal.current = randomPointInCorner(circle);
        idleUntil.current = t + 1.5 + Math.random() * 2.5;
      }
    } else {
      const nx = (dx / dist) * WALK_SPEED * delta;
      const nz = (dz / dist) * WALK_SPEED * delta;
      position.current = [px + nx, pz + nz];
      g.position.set(position.current[0], 0, position.current[1]);
      g.rotation.y = Math.atan2(nx, nz);
      const stepDist = Math.hypot(nx, nz);
      motion.current.speed = stepDist / delta;
      motion.current.gaitPhase += (stepDist / 1.1) * Math.PI * 2;
    }
  });

  return (
    <group ref={group} position={[position.current[0], 0, position.current[1]]}>
      <CharacterModel profile={profile} mood={mood} gaze={gaze} motion={motion} look={look} />
    </group>
  );
}

function PlazaScene() {
  const family = useCircle("family");
  const friends = useCircle("friend");
  return (
    <group>
      {family.map((profile) => (
        <WanderingCharacter key={profile.id} profile={profile} circle="family" />
      ))}
      {friends.map((profile) => (
        <WanderingCharacter key={profile.id} profile={profile} circle="friend" />
      ))}
      <ambientLight intensity={0.65} />
      <directionalLight position={[4, 6, 4]} intensity={0.9} castShadow={false} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow={false}>
        <planeGeometry args={[16, 10]} />
        <meshStandardMaterial color="#f6e4c8" />
      </mesh>
    </group>
  );
}

function draftToProfile(draft: DraftPerson): FamilyProfile {
  return {
    id: draft.editingId ?? "draft",
    name: draft.name || "…",
    relationship: draft.relationship,
    look: "custom",
    colors: [draft.look.bodyColor, draft.look.accent],
    personality: [],
    loves: [],
    avoids: [],
    houseRules: [],
  };
}

function OrbitPlane() {
  const dragging = useRef(false);
  const last = useRef<[number, number]>([0, 0]);

  function onPointerDown(event: ThreeEvent<PointerEvent>) {
    dragging.current = true;
    last.current = [event.clientX, event.clientY];
    (event.target as Element)?.setPointerCapture?.(event.pointerId);
  }
  function onPointerMove(event: ThreeEvent<PointerEvent>) {
    if (!dragging.current) return;
    const dx = event.clientX - last.current[0];
    last.current = [event.clientX, event.clientY];
    addYaw(dx / Math.max(1, window.innerWidth), 6);
  }
  function onPointerUp() {
    dragging.current = false;
  }

  return (
    <mesh position={[0, 1, 0]} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerOut={onPointerUp}>
      <planeGeometry args={[6, 6]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function EditorScene({ draft }: { draft: DraftPerson }) {
  const group = useRef<import("three").Group>(null);
  const mood = useRef<SpriteMood>("idle");
  const gaze = useRef({ x: 0, y: 0 });
  const motion = useRef<CharacterMotion>(createMotion());
  const lastPick = useRef(-Infinity);
  const lastCelebrate = useRef(-Infinity);
  const hopUntil = useRef(-Infinity);
  const celebrateUntil = useRef(-Infinity);
  const profile = draftToProfile(draft);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    gaze.current.x = state.pointer.x;
    gaze.current.y = state.pointer.y;
    const t = state.clock.elapsedTime;

    if (reactions.pickAt !== lastPick.current) {
      lastPick.current = reactions.pickAt;
      motion.current.jumpAt = t;
      hopUntil.current = t + 0.6;
    }
    if (reactions.celebrateAt !== lastCelebrate.current) {
      lastCelebrate.current = reactions.celebrateAt;
      motion.current.jumpAt = t;
      celebrateUntil.current = t + 1.4;
    }
    mood.current = t < celebrateUntil.current ? "celebrating" : t < hopUntil.current ? "happy" : "hovered";

    turntable.idleFor += delta;
    if (turntable.idleFor > 1.5) turntable.yaw = MathUtils.damp(turntable.yaw, 0, 0.6, delta);
    if (group.current) group.current.rotation.y = turntable.yaw;
  });

  return (
    <group>
      <group ref={group} position={[0, 0, 0]}>
        <CharacterModel profile={profile} mood={mood} gaze={gaze} motion={motion} look={draft.look} />
      </group>
      <OrbitPlane />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 4]} intensity={1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[2.4, 32]} />
        <meshStandardMaterial color="#ffe9c7" />
      </mesh>
    </group>
  );
}

export interface MakerCanvasProps {
  step: MakerStep;
  draft: DraftPerson | null;
}

export default function MakerCanvas({ step, draft }: MakerCanvasProps) {
  const editing = (step === "editor" || step === "quit-dialog") && draft !== null;
  return (
    <Canvas
      shadows={false}
      dpr={[1, 1.5]}
      camera={{
        position: editing ? [0, 1.5, 3.4] : [0, 6, 7.5],
        fov: editing ? 35 : 45,
      }}
      onCreated={({ camera }) => camera.lookAt(0, editing ? 1 : 0, 0)}
    >
      <Suspense fallback={null}>{editing && draft ? <EditorScene draft={draft} /> : <PlazaScene />}</Suspense>
    </Canvas>
  );
}
