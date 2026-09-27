"use client";

import { Suspense, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { PlazaFloor } from "@/components/maker/plaza/PlazaFloor";
import { PlazaPerson } from "@/components/maker/plaza/PlazaPerson";
import { PlazaPointer } from "@/components/maker/plaza/PlazaPointer";
import { usePlaza } from "@/components/maker/plaza/plazaState";
import { characterForLook, characterTuning, MODEL_HEIGHT } from "@/components/sprites/characterPose";
import { flakeTexture } from "@/components/stage/room/textures";
import { getAgents, getCrowd, radiusForScale, resolveOverlaps } from "@/lib/people/crowd";
import { useLook, usePeople } from "@/lib/people/roster";
import { BLANK_LOOK, STARTER_LOOKS } from "@/lib/people/starters";
import type { PickRole } from "./giftFlow";
import styles from "./HomeHub.module.css";

// The home hub's one canvas: the same Mii-style Plaza as /create (floor, wandering crowd, pointer
// picking) wrapped for the gift flow — picked characters walk to formation slots and wear a role
// ring and badge, and a light snowfall marks the season. PlazaPerson/PlazaFloor/PlazaPointer are
// the maker's own components, reused untouched; only the crowd owner and the markers live here.

/** Reads the mouse's client position off a plaza pointer event as canvas-relative NDC. */
function eventToNdc(event: ReactPointerEvent<HTMLDivElement>): [number, number] {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  return [x, y];
}

function HubCrowd({ slots }: { slots: Record<string, [number, number]> | null }) {
  const people = usePeople();
  useFrame(() => {
    resolveOverlaps(getAgents("plaza"));
  });
  return (
    <group>
      {people.map((profile) => (
        <PlazaPerson key={profile.id} profile={profile} formationSlot={slots?.[profile.id] ?? null} />
      ))}
    </group>
  );
}

const ringGeometry = new THREE.RingGeometry(0.86, 1, 48);
const ROLE_COLORS: Record<PickRole, string> = { recipient: "#ffb347", advisor: "#8fd14f" };
const ROLE_LABELS: Record<PickRole, string> = { recipient: "Recipient", advisor: "Advisor" };
const BADGE_MARGIN = 0.9;

/** Follows one picked character on the floor with a role ring and a badge over their name tag. */
function RoleMarker({ id, role, name }: { id: string; role: PickRole; name: string }) {
  const look = useLook(id) ?? STARTER_LOOKS[id] ?? BLANK_LOOK;
  const character = useMemo(() => characterForLook(look, id), [look, id]);
  const height = MODEL_HEIGHT * character.scale * characterTuning.scale;
  const radius = Math.max(0.12, radiusForScale(character.scale, character.width));
  const root = useRef<THREE.Group>(null);
  const pulse = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const agent = getCrowd("plaza").get(id);
    if (!agent || !root.current) return;
    root.current.position.set(agent.x, 0, agent.z);
    if (pulse.current) {
      const s = radius * 2.6 * (1 + Math.sin(state.clock.elapsedTime * 2.2) * 0.04);
      pulse.current.scale.setScalar(s);
    }
  });

  return (
    <group ref={root}>
      <mesh ref={pulse} geometry={ringGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <meshBasicMaterial color={ROLE_COLORS[role]} transparent opacity={0.85} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[0, height + BADGE_MARGIN, 0]} zIndexRange={[0, 0]} pointerEvents="none">
        <div className={role === "recipient" ? styles.badgeRecipient : styles.badgeAdvisor}>
          <span className={styles.badgeRole}>{ROLE_LABELS[role]}</span>
          <span className={styles.badgeName}>{name}</span>
        </div>
      </Html>
    </group>
  );
}

const SNOW_COUNT = 260;
const SNOW_BOX = { x: [-10, 10], y: [0.2, 9], z: [-9, 6] } as const;

/** A gentle seasonal snowfall over the plaza: one Points draw call, positions advanced on the CPU. */
function HubSnow() {
  const points = useRef<THREE.Points>(null);
  const texture = useMemo(() => flakeTexture(), []);
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(SNOW_COUNT * 3);
    const speeds = new Float32Array(SNOW_COUNT);
    for (let i = 0; i < SNOW_COUNT; i += 1) {
      positions[i * 3] = SNOW_BOX.x[0] + Math.random() * (SNOW_BOX.x[1] - SNOW_BOX.x[0]);
      positions[i * 3 + 1] = SNOW_BOX.y[0] + Math.random() * (SNOW_BOX.y[1] - SNOW_BOX.y[0]);
      positions[i * 3 + 2] = SNOW_BOX.z[0] + Math.random() * (SNOW_BOX.z[1] - SNOW_BOX.z[0]);
      speeds[i] = 0.35 + Math.random() * 0.5;
    }
    return { positions, speeds };
  }, []);

  useFrame(({ clock }, delta) => {
    const attribute = points.current?.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!attribute) return;
    const dt = Math.min(delta, 0.1);
    const time = clock.elapsedTime;
    for (let i = 0; i < SNOW_COUNT; i += 1) {
      const y = positions[i * 3 + 1]! - speeds[i]! * dt;
      positions[i * 3 + 1] = y < SNOW_BOX.y[0] ? SNOW_BOX.y[1] : y;
      positions[i * 3] += Math.sin(time * 0.6 + i) * 0.18 * dt;
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial map={texture} size={0.14} sizeAttenuation transparent depthWrite={false} opacity={0.85} color="#ffffff" />
    </points>
  );
}

export interface HubCanvasProps {
  /** Formation slots while picking (everyone gets one), or null to let the crowd wander. */
  slots: Record<string, [number, number]> | null;
  roles: Record<string, PickRole>;
  names: Record<string, string>;
}

export default function HubCanvas({ slots, roles, names }: HubCanvasProps) {
  // Same pointer wiring as the People Maker's plaza: the mouse is one source into usePlaza, and the
  // hand track (MakerHands) writes the same field, so PlazaPointer picks people for both.
  const pointerHandlers = {
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => usePlaza.getState().setPointer(eventToNdc(event), "mouse"),
    onPointerLeave: () => {
      if (!usePlaza.getState().grabbing) usePlaza.getState().setPointer(null, null);
    },
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
      style={{ cursor: "inherit" }}
      camera={{ position: [0, 12, 10], fov: 40 }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      {...pointerHandlers}
    >
      <Suspense fallback={null}>
        <PlazaFloor />
        <HubCrowd slots={slots} />
        <PlazaPointer />
        {Object.entries(roles).map(([id, role]) => (
          <RoleMarker key={id} id={id} role={role} name={names[id] ?? ""} />
        ))}
        <HubSnow />
      </Suspense>
    </Canvas>
  );
}
