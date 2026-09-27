"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { characterForLook, characterTuning, MODEL_HEIGHT } from "@/components/sprites/characterPose";
import { getCrowd, radiusForScale } from "@/lib/people/crowd";
import { useLook, usePeople } from "@/lib/people/roster";
import { BLANK_LOOK, STARTER_LOOKS } from "@/lib/people/starters";
import { giftRoleOf, type GiftPickState, type GiftRole } from "./giftPick";
import { usePlazaHtmlPortal } from "./plazaState";
import styles from "./GiftPickBar.module.css";

// While a gift's people are being picked, each picked character wears a role ring on the floor and
// a badge over their name tag. Positions follow the shared "plaza" crowd agent, so the markers walk
// with the character into the line-up.

const ringGeometry = new THREE.RingGeometry(0.86, 1, 48);
const ROLE_COLORS: Record<GiftRole, string> = { recipient: "#ffb347", buyer: "#8fd14f" };
const ROLE_LABELS: Record<GiftRole, string> = { recipient: "Gift for", buyer: "Buying" };
const BADGE_MARGIN = 1.15;

function RoleMarker({ id, role, name }: { id: string; role: GiftRole; name: string }) {
  const look = useLook(id) ?? STARTER_LOOKS[id] ?? BLANK_LOOK;
  const character = useMemo(() => characterForLook(look, id), [look, id]);
  const height = MODEL_HEIGHT * character.scale * characterTuning.scale;
  const radius = Math.max(0.12, radiusForScale(character.scale, character.width));
  const root = useRef<THREE.Group>(null);
  const pulse = useRef<THREE.Mesh>(null);
  const portal = usePlazaHtmlPortal();

  useFrame((state) => {
    const agent = getCrowd("plaza").get(id);
    if (!agent || !root.current) return;
    root.current.position.set(agent.x, 0, agent.z);
    if (pulse.current) pulse.current.scale.setScalar(radius * 2.6 * (1 + Math.sin(state.clock.elapsedTime * 2.2) * 0.04));
  });

  return (
    <group ref={root}>
      <mesh ref={pulse} geometry={ringGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <meshBasicMaterial color={ROLE_COLORS[role]} transparent opacity={0.85} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <Html portal={portal} position={[0, height + BADGE_MARGIN, 0]} zIndexRange={[60, 0]} pointerEvents="none">
        <div className={role === "recipient" ? styles.badgeRecipient : styles.badgeBuyer}>
          <span className={styles.badgeRole}>{ROLE_LABELS[role]}</span>
          <span className={styles.badgeName}>{name}</span>
        </div>
      </Html>
    </group>
  );
}

export function GiftRoleMarkers({ pick }: { pick: GiftPickState }) {
  const people = usePeople();
  return (
    <>
      {people.map((person) => {
        const role = giftRoleOf(pick, person.id);
        return role ? <RoleMarker key={person.id} id={person.id} role={role} name={person.name} /> : null;
      })}
    </>
  );
}
