"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { easing } from "maath";
import { AdditiveBlending, Color, MeshBasicMaterial, RingGeometry, type Group, type Mesh } from "three";
import { createAuraMaterial } from "@/components/sprites/materials";
import { COUNCIL_RING, seatPosition } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import { registerTarget } from "@/lib/stage/targets";

// The glowing council ring on the rug plus one seat marker per ring seat (registered as `seat:<i>`).
// The room track draws the rug itself.

const RING_COLOR = "#ffd18a";
const SEAT_RADIUS = 0.95;
/** A dragged sprite this close (ft) to a seat makes it pulse. */
const NEAR_SEAT = 2.2;

let ringGeometries: { ring: RingGeometry; seat: RingGeometry } | undefined;

function sharedRingGeometries() {
  ringGeometries ??= {
    ring: new RingGeometry(COUNCIL_RING.radius - 0.05, COUNCIL_RING.radius + 0.05, 160),
    seat: new RingGeometry(SEAT_RADIUS - 0.14, SEAT_RADIUS, 64),
  };
  return ringGeometries;
}

function glowMaterial(opacity: number) {
  return new MeshBasicMaterial({
    color: RING_COLOR,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
}

function Seat({ index }: { index: number }) {
  const group = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const occupied = useStage((state) => Object.values(state.sprites).some((sprite) => sprite.seat === index));
  const geometries = sharedRingGeometries();
  const materials = useMemo(() => ({ ring: glowMaterial(0.35), glow: createAuraMaterial(RING_COLOR, 0.15) }), []);
  const anim = useRef({ glow: 0.15, pulse: 0 });
  const position = useMemo(() => seatPosition(index), [index]);

  useEffect(() => (group.current ? registerTarget(`seat:${index}`, group.current, 1.1) : undefined), [index]);
  useEffect(
    () => () => {
      materials.ring.dispose();
      materials.glow.dispose();
    },
    [materials],
  );

  useFrame(({ clock }, delta) => {
    const { hand } = useStage.getState();
    let near = 0;
    if (hand.draggingSpriteId && hand.floorPoint) {
      const dx = hand.floorPoint[0] - position[0];
      const dz = hand.floorPoint[2] - position[2];
      near = Math.max(0, 1 - Math.hypot(dx, dz) / NEAR_SEAT);
    }
    const hovered = hand.hoverTarget === `seat:${index}`;
    const wave = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 7);

    easing.damp(anim.current, "glow", occupied ? 0.75 : hovered ? 0.55 : 0.15, 0.25, delta);
    easing.damp(anim.current, "pulse", Math.max(near, hovered ? 0.6 : 0), 0.12, delta);
    const { glow, pulse } = anim.current;

    materials.glow.uniforms.uOpacity!.value = glow + pulse * (0.4 + 0.5 * wave);
    materials.ring.opacity = 0.3 + glow * 0.5 + pulse * 0.4 * wave;
    ring.current?.scale.setScalar(1 + pulse * 0.12 * wave);
  });

  return (
    <group ref={group} position={position}>
      <mesh ref={ring} geometry={geometries.seat} material={materials.ring} position-y={0.025} rotation-x={-Math.PI / 2} />
      <mesh material={materials.glow} position-y={0.02} rotation-x={-Math.PI / 2} scale={SEAT_RADIUS * 2.2}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  );
}

export function CouncilRing() {
  const geometries = sharedRingGeometries();
  const material = useMemo(() => glowMaterial(0.28), []);
  const phase = useStage((state) => state.phase);
  const colors = useMemo(() => ({ idle: new Color(RING_COLOR), active: new Color("#ffc16b") }), []);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock }, delta) => {
    // Breathes gently in the lobby, brightens once the council is in session.
    const active = phase !== "lobby";
    const target = (active ? 0.5 : 0.22) + Math.sin(clock.elapsedTime * 1.3) * 0.06;
    easing.damp(material, "opacity", target, 0.5, delta);
    easing.dampC(material.color, active ? colors.active : colors.idle, 0.5, delta);
  });

  return (
    <group>
      <mesh
        geometry={geometries.ring}
        material={material}
        position={COUNCIL_RING.center}
        position-y={0.015}
        rotation-x={-Math.PI / 2}
      />
      {COUNCIL_RING.seatAngles.map((_, index) => (
        <Seat key={index} index={index} />
      ))}
    </group>
  );
}
