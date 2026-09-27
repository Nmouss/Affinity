"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { easing } from "maath";
import * as THREE from "three";
import { SpeechBubble } from "@/components/council/SpeechBubble";
import { CharacterModel } from "@/components/sprites/CharacterModel";
import { characterForLook, characterTuning, createMotion, MODEL_HEIGHT } from "@/components/sprites/characterPose";
import { getAgents, radiusForScale, registerAgent, steer, unregisterAgent, type CrowdAgent } from "@/lib/people/crowd";
import { useLook, useRoster } from "@/lib/people/roster";
import { useStage } from "@/lib/stage/store";
import { BLANK_LOOK, STARTER_LOOKS } from "@/lib/people/starters";
import type { FamilyProfile } from "@/types/domain";
import type { SpriteMood } from "@/types/stage";
import { PLAZA } from "./formation";
import { registerHit, unregisterHit } from "./plazaHits";
import { giftRoleOf } from "./giftPick";
import { clearOfControls } from "./plazaKeepOut";
import { constrainOutsideMissionCircle, isInsideMissionCircle, MISSION_CIRCLE, usePlaza, usePlazaHtmlPortal } from "./plazaState";
import { consumeDragOutcome, plazaPointerFloor } from "./plazaSignals";
import styles from "./PlazaPerson.module.css";

// One roster person, wandering the plaza floor (or lined up for the whistle), plus a contact
// shadow, an invisible hit capsule for PlazaPointer's raycasts, a hover/select glow ring, and a
// Mii-style name tag. Position lives on the shared "plaza" crowd agent (lib/people/crowd.ts);
// PlazaCrowd resolves overlaps between everyone once per frame, after all of these have moved.

const DRAG_LIFT = 0.6;
const WALK_ACCEL = 5;
const WALK_SLOW_RADIUS = 1.2;
const ARRIVE_EPS = 0.12;
const WALK_FACING_SPEED = 0.25;
const IDLE_MIN = 2;
const IDLE_MAX = 6;
/** Minimum gap kept from already-registered agents when spawning, so people start spread out. */
const SPREAD_MIN_DIST = 1.4;
const LABEL_MARGIN = 0.34;
/** Never let a tiny look's hit capsule (or its contact shadow) collapse to nothing. */
const MIN_HIT_RADIUS = 0.12;

function randomDiscPoint(radius: number): [number, number] {
  const r = radius * Math.sqrt(Math.random());
  const theta = Math.random() * Math.PI * 2;
  return [Math.cos(theta) * r, Math.sin(theta) * r];
}

/** While dinner participant selection is open, roaming people stay out of its target so entering
 * the circle is always a deliberate drag-and-drop action. */
function roamingPoint(radius: number, avoidMissionCircle: boolean, fits: (x: number, z: number) => boolean = () => true): [number, number] {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const point = randomDiscPoint(radius);
    if (avoidMissionCircle && isInsideMissionCircle(point[0], point[1])) continue;
    if (!fits(point[0], point[1])) continue;
    return point;
  }
  return [Math.min(radius, MISSION_CIRCLE.radius + 0.5), 0];
}

/** A random point in the disc that isn't already crowded by another agent, so a fresh spawn (or a
 * new wander goal) doesn't land right on top of somebody else. */
function spreadPoint(radius: number, minDist: number, avoidMissionCircle: boolean, fits?: (x: number, z: number) => boolean): [number, number] {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const [x, z] = roamingPoint(radius, avoidMissionCircle, fits);
    let ok = true;
    for (const other of getAgents("plaza")) {
      if (Math.hypot(other.x - x, other.z - z) < minDist) {
        ok = false;
        break;
      }
    }
    if (ok) return [x, z];
  }
  return roamingPoint(radius, avoidMissionCircle, fits);
}

// --- Shared, app-lifetime resources (never disposed — same convention as CharacterModel's module-
// level shared geometries/materials). Only per-look materials get a useMemo + dispose-on-unmount. -

function buildShadowCanvas(): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(35,24,14,0.4)");
    gradient.addColorStop(0.65, "rgba(35,24,14,0.22)");
    gradient.addColorStop(1, "rgba(35,24,14,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return canvas;
}

const shadowTexture = new THREE.CanvasTexture(buildShadowCanvas());
const shadowMaterial = new THREE.MeshBasicMaterial({
  map: shadowTexture,
  transparent: true,
  depthWrite: false,
  toneMapped: false,
});
const shadowGeometry = new THREE.CircleGeometry(1, 24);
const ringGeometry = new THREE.RingGeometry(0.92, 1, 40);

export interface PlazaPersonProps {
  profile: FamilyProfile;
  /** This id's slot while the whistle is on; null wanders instead. */
  formationSlot: [number, number] | null;
  /** Stable spot inside the mission circle; members do not resume wandering. */
  missionSlot: [number, number] | null;
  /** The circle only reserves floor space while members are gathered in it: dinner-plan participant
   * selection, or a running council of either kind. */
  missionCircleOpen: boolean;
}

export function PlazaPerson({ profile, formationSlot, missionSlot, missionCircleOpen }: PlazaPersonProps) {
  const { id, name } = profile;
  const look = useLook(id) ?? STARTER_LOOKS[id] ?? BLANK_LOOK;
  const circle = useRoster((state) => state.circles[id]);
  const character = useMemo(() => characterForLook(look, id), [look, id]);
  const height = MODEL_HEIGHT * character.scale * characterTuning.scale;
  const hitRadius = Math.max(MIN_HIT_RADIUS, radiusForScale(character.scale, character.width));

  const hovered = usePlaza((state) => state.hoveredId === id);
  const selected = usePlaza((state) => state.selectedId === id);
  const dragging = usePlaza((state) => state.draggingId === id);
  const whistleOn = usePlaza((state) => state.whistle.on);
  const pickingGift = usePlaza((state) => state.giftPick !== null);
  const giftRole = usePlaza((state) => (state.giftPick ? giftRoleOf(state.giftPick, id) : null));
  const councilBubble = useStage((state) => state.sprites[id]?.bubble ?? null);
  const councilMood = useStage((state) => state.sprites[id]?.mood ?? "idle");
  const councilPhase = useStage((state) => state.phase);
  const councilActive = missionSlot !== null && councilPhase !== "lobby";

  const root = useRef<THREE.Group>(null);
  const facing = useRef<THREE.Group>(null);
  const hitRef = useRef<THREE.Mesh>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const mood = useRef<SpriteMood>("idle");
  const gaze = useRef({ x: 0, y: 0 });
  const motion = useRef(createMotion());

  const agentRef = useRef<CrowdAgent | null>(null);
  const goal = useRef<[number, number]>([0, 0]);
  const idleUntil = useRef(0);
  const velScratch = useRef({ vx: 0, vz: 0 });
  const pickupPos = useRef<[number, number]>([0, 0]);
  const liftY = useRef(0);
  const ringGlow = useRef(0);
  const wasDragging = useRef(false);
  const wasWhistleOn = useRef(false);
  const camera = useThree((state) => state.camera);
  // Wander goals keep people clear of the rails and bars so there's always room to pick them.
  const clearSpot = (x: number, z: number) => clearOfControls(x, z, camera);

  useEffect(() => {
    const avoidMissionCircle = usePlaza.getState().missionMode === "plan";
    const [x, z] = spreadPoint(PLAZA.radius * 0.9, SPREAD_MIN_DIST, avoidMissionCircle, clearSpot);
    const agent = registerAgent("plaza", { id, x, z, vx: 0, vz: 0, radius: hitRadius, pinned: false });
    agentRef.current = agent;
    goal.current = roamingPoint(PLAZA.radius * 0.88, avoidMissionCircle, clearSpot);
    idleUntil.current = Math.random() * IDLE_MAX;
    root.current?.position.set(x, 0, z);
    return () => {
      unregisterAgent("plaza", id);
      agentRef.current = null;
    };
    // Only re-registers if the person themself changes; a look edit adjusting hitRadius updates the
    // already-registered agent in place via the frame loop below instead of re-spawning them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const mesh = hitRef.current;
    if (!mesh) return undefined;
    registerHit(id, mesh);
    return () => unregisterHit(id);
  }, [id]);

  useFrame((state, rawDelta) => {
    const group = root.current;
    const agent = agentRef.current;
    if (!group || !agent) return;
    const delta = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime;
    agent.radius = hitRadius;
    if (!dragging) agent.pinned = missionSlot !== null;

    if (dragging && !wasDragging.current) {
      pickupPos.current = [agent.x, agent.z];
      agent.pinned = true;
    }
    if (!dragging && wasDragging.current) {
      const outcome = consumeDragOutcome(id);
      if (outcome === "icon") {
        agent.x = pickupPos.current[0];
        agent.z = pickupPos.current[1];
      }
      agent.pinned = missionSlot !== null;
      agent.vx = 0;
      agent.vz = 0;
      motion.current.landAt = t;
      idleUntil.current = t + IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
      goal.current = [agent.x, agent.z];
    }
    wasDragging.current = dragging;

    if (!whistleOn && wasWhistleOn.current) {
      // Resume wandering right where we stand instead of walking back to a stale pre-whistle goal.
      goal.current = [agent.x, agent.z];
      idleUntil.current = t;
    }
    wasWhistleOn.current = whistleOn;

    let movedX = 0;
    let movedZ = 0;
    let moved = 0;

    if (dragging) {
      const target = plazaPointerFloor;
      const prevX = agent.x;
      const prevZ = agent.z;
      agent.x = THREE.MathUtils.damp(agent.x, target.x, 6, delta);
      agent.z = THREE.MathUtils.damp(agent.z, target.z, 6, delta);
      agent.vx = 0;
      agent.vz = 0;
      movedX = agent.x - prevX;
      movedZ = agent.z - prevZ;
      moved = Math.hypot(movedX, movedZ);
    } else {
      // While a gift's people are being picked, the line-up wins over the mission circle and the whistle.
      const heldSlot = pickingGift ? formationSlot : missionSlot ?? (whistleOn ? formationSlot : null);
      const [goalX, goalZ] = heldSlot ?? goal.current;
      const dist = Math.hypot(goalX - agent.x, goalZ - agent.z);
      const waiting = heldSlot ? dist < ARRIVE_EPS : t < idleUntil.current || dist < ARRIVE_EPS;
      if (waiting) {
        agent.vx = 0;
        agent.vz = 0;
        if (!heldSlot && dist < ARRIVE_EPS && t >= idleUntil.current) {
          goal.current = spreadPoint(PLAZA.radius * 0.88, SPREAD_MIN_DIST, missionCircleOpen, clearSpot);
          idleUntil.current = t + IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
        }
      } else {
        const maxSpeed = character.walkSpeed * characterTuning.walkSpeed;
        steer(
          agent,
          getAgents("plaza"),
          { goalX, goalZ, maxSpeed, accel: WALK_ACCEL, slowRadius: WALK_SLOW_RADIUS, dt: delta },
          velScratch.current,
        );
        agent.vx = velScratch.current.vx;
        agent.vz = velScratch.current.vz;
        movedX = agent.vx * delta;
        movedZ = agent.vz * delta;
        agent.x += movedX;
        agent.z += movedZ;
        moved = Math.hypot(movedX, movedZ);
      }
    }

    // Random destinations already avoid the circle, but a straight path between two legal points
    // can still cross it. Treat the circle as a physical boundary for non-members and give anyone
    // who reaches it a short around-the-edge waypoint. Deliberate dragging remains unrestricted.
    // Picked gift people may step into the circle: their line-up is the mission taking shape.
    if (missionCircleOpen && !dragging && missionSlot === null && !(pickingGift && formationSlot)) {
      const [safeX, safeZ] = constrainOutsideMissionCircle(agent.x, agent.z, agent.radius + 0.12);
      if (safeX !== agent.x || safeZ !== agent.z) {
        agent.x = safeX;
        agent.z = safeZ;
        agent.vx = 0;
        agent.vz = 0;
        const boundaryAngle = Math.atan2(safeZ - MISSION_CIRCLE.z, safeX - MISSION_CIRCLE.x);
        const turn = id.charCodeAt(0) % 2 === 0 ? 0.62 : -0.62;
        const waypointRadius = MISSION_CIRCLE.radius + agent.radius + 1.1;
        goal.current = [
          MISSION_CIRCLE.x + Math.cos(boundaryAngle + turn) * waypointRadius,
          MISSION_CIRCLE.z + Math.sin(boundaryAngle + turn) * waypointRadius,
        ];
        idleUntil.current = t;
        movedX = agent.x - group.position.x;
        movedZ = agent.z - group.position.z;
        moved = Math.hypot(movedX, movedZ);
      }
    }

    const speed = moved / delta;
    motion.current.speed = dragging ? 0 : speed;
    if (!dragging) motion.current.gaitPhase += (moved / character.stride) * Math.PI * 2;

    liftY.current = THREE.MathUtils.damp(liftY.current, dragging ? DRAG_LIFT : 0, 8, delta);
    group.position.set(agent.x, liftY.current, agent.z);

    if (facing.current) {
      const walking = !dragging && speed > WALK_FACING_SPEED;
      const angle = walking
        ? Math.atan2(movedX, movedZ)
        : dragging
          ? facing.current.rotation.y
          : Math.atan2(state.camera.position.x - agent.x, state.camera.position.z - agent.z);
      easing.dampAngle(facing.current.rotation, "y", angle, walking ? 0.18 : 0.32, delta);
    }

    mood.current = dragging ? "held" : hovered ? "hovered" : councilActive ? councilMood : "idle";

    const featured = councilActive && Boolean(councilBubble);
    ringGlow.current = THREE.MathUtils.damp(ringGlow.current, hovered || selected || featured ? 1 : 0, 10, delta);
    if (ringMatRef.current) {
      ringMatRef.current.color.set(featured ? "#6b7349" : "#c4b89a");
      ringMatRef.current.opacity = ringGlow.current * (featured ? 0.9 : 0.75);
    }
  });

  const chipClass = circle === "family" ? styles.chipFamily : styles.chipFriend;
  const bubbleAlign = missionSlot
    ? missionSlot[0] < -0.2
      ? "left"
      : missionSlot[0] > 0.2
        ? "right"
        : "center"
    : "center";
  const htmlPortal = usePlazaHtmlPortal();

  return (
    <group ref={root}>
      <mesh
        geometry={shadowGeometry}
        material={shadowMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        scale={hitRadius * 1.7}
      />
      <mesh geometry={ringGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]} scale={hitRadius * 2.2}>
        <meshBasicMaterial
          ref={ringMatRef}
          color="#c4b89a"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={hitRef} visible={false} position={[0, height / 2, 0]}>
        <capsuleGeometry args={[hitRadius, Math.max(0.05, height - 2 * hitRadius), 4, 8]} />
      </mesh>
      <group ref={facing}>
        <CharacterModel profile={profile} mood={mood} gaze={gaze} motion={motion} look={look} />
      </group>
      {councilActive && councilBubble && (
        <Html portal={htmlPortal} position={[0, height + LABEL_MARGIN + 0.45, 0]} zIndexRange={[80, 0]} pointerEvents="none">
          <SpeechBubble
            speaker={name}
            text={councilBubble}
            accent={profile.colors[0] ?? "#6b7349"}
            align={bubbleAlign}
            active
          />
        </Html>
      )}
      {!councilBubble && !giftRole && (
        <Html portal={htmlPortal} position={[0, height + LABEL_MARGIN, 0]} zIndexRange={[40, 0]} pointerEvents="none">
          <div className={`${styles.tag} ${councilActive && councilMood === "speaking" ? styles.speaking : ""}`}>
            <span className={chipClass}>{circle === "family" ? "Family" : "Friend"}</span>
            {name}
          </div>
        </Html>
      )}
    </group>
  );
}
