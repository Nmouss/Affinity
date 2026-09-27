"use client";

import { Suspense, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { MathUtils } from "three";
import { CharacterModel } from "@/components/sprites/CharacterModel";
import { createMotion, type CharacterMotion } from "@/components/sprites/characterPose";
import type { FamilyProfile } from "@/types/domain";
import type { SpriteMood } from "@/types/stage";
import type { DraftPerson, MakerStep } from "./flow";
import { PlazaCrowd } from "./plaza/PlazaCrowd";
import { PlazaFloor } from "./plaza/PlazaFloor";
import { MissionCircle } from "./plaza/MissionCircle";
import { PlazaPointer } from "./plaza/PlazaPointer";
import { usePlaza } from "./plaza/plazaState";
import { reactions } from "./reactions";
import { addYaw, turntable } from "./turntable";

// The People Maker's one canvas: a Mii-style Plaza (everyone wandering the tiled floor) in every
// step but the editor, and a turntable with the draft person while editing. Kept intentionally
// simple — no postprocessing, cheap shadows — since this is a UI-heavy screen, not the family
// council stage.

function PlazaScene() {
  return (
    <group>
      <PlazaFloor />
      <MissionCircle />
      <PlazaCrowd />
      <PlazaPointer />
    </group>
  );
}

/** Reads the mouse's client position off a plaza pointer event as canvas-relative NDC. */
function eventToNdc(event: ReactPointerEvent<HTMLDivElement>): [number, number] {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  return [x, y];
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
  // In the plaza the canvas inherits PeopleMaker's pointing-hand / grabbing-fist cursor.
  const cursor = editing ? "auto" : "inherit";

  // The single mouse pointer source for the plaza (usePlaza.pointer); the hand track writes the
  // same field from Leap frames. Only wired while not editing — the turntable has its own drag
  // (OrbitPlane) and never reads usePlaza.
  const pointerHandlers = editing
    ? undefined
    : {
        onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => usePlaza.getState().setPointer(eventToNdc(event), "mouse"),
        onPointerLeave: () => {
          if (!usePlaza.getState().grabbing) usePlaza.getState().setPointer(null, null);
        },
        // Capture the press so a person dragged over the DOM rails keeps reporting moves and the
        // release lands here (the scene then hit-tests the rail icon under the pointer for the drop).
        onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          usePlaza.getState().setPointer(eventToNdc(event), "mouse");
          usePlaza.getState().setGrabbing(true);
        },
        onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
          usePlaza.getState().setPointer(eventToNdc(event), "mouse");
          usePlaza.getState().setGrabbing(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        },
        onPointerCancel: () => usePlaza.getState().setGrabbing(false),
      };

  return (
    <Canvas
      shadows={false}
      dpr={[1, 1.5]}
      style={{ cursor }}
      camera={{
        position: editing ? [0, 1.5, 3.4] : [0, 12, 10],
        fov: editing ? 35 : 40,
      }}
      onCreated={({ camera }) => camera.lookAt(0, editing ? 1 : 0, 0)}
      {...pointerHandlers}
    >
      <Suspense fallback={null}>{editing && draft ? <EditorScene draft={draft} /> : <PlazaScene />}</Suspense>
    </Canvas>
  );
}
