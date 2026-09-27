"use client";

import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { PLAZA } from "./formation";

// Little ambient life for the plaza, in the same toy style as the clouds: a tumbleweed that rolls
// across the floor and bounces off the rim, butterflies looping lazily above head height, and the
// odd leaf spiralling down from the sky. Everything is code-drawn, cheap, and (like the clouds)
// grabbable: pick one up, drop it somewhere else, and it carries on from there. They use the scene's
// own pointer events, a separate track from the crowd's picking, so they never count as a person.

const RIM = PLAZA.radius + 4.5;

/** Small deterministic PRNG so the scene is the same every visit. */
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

/** Shared grab plumbing: a body slides on a camera-facing plane through its grab point. */
interface Grab {
  pointerId: number;
  offset: THREE.Vector3;
  plane: THREE.Plane;
}

const hitScratch = new THREE.Vector3();

function useGrab(onMove: (point: THREE.Vector3) => void, onRelease: () => void) {
  const grab = useRef<Grab | null>(null);
  const hovered = useRef(false);

  const down = (event: ThreeEvent<PointerEvent>, position: THREE.Vector3) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.stopPropagation();
    const normal = event.camera.getWorldDirection(new THREE.Vector3()).negate();
    grab.current = {
      pointerId: event.pointerId,
      offset: position.clone().sub(event.point),
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, position),
    };
    (event.target as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(event.pointerId);
  };
  const move = (event: ThreeEvent<PointerEvent>) => {
    const current = grab.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (!event.ray.intersectPlane(current.plane, hitScratch)) return;
    onMove(hitScratch.add(current.offset));
  };
  const up = (event: ThreeEvent<PointerEvent>) => {
    const current = grab.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    (event.target as { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(event.pointerId);
    grab.current = null;
    onRelease();
  };
  const handlers = {
    onPointerMove: move,
    onPointerUp: up,
    onPointerCancel: up,
    onPointerOver: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      hovered.current = true;
    },
    onPointerOut: () => {
      hovered.current = false;
    },
  };
  return { grab, hovered, down, handlers };
}

// ---------------------------------------------------------------------------------------------
// Tumbleweed: a scribbly ball that rolls across the plaza, bounces off the rim, hops now and then.

const TUMBLE_SPEED = 2.2;
const TUMBLE_RADIUS = 0.42;
const weedMaterial = new THREE.MeshStandardMaterial({ color: "#c9a96a", roughness: 1, metalness: 0 });

/** A ball of thin torus "twigs" at random tilts reads as a tumbleweed from any angle. */
function Tumbleweed() {
  const twigs = useMemo(() => {
    const random = mulberry(11);
    return Array.from({ length: 9 }, () => ({
      rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI] as [number, number, number],
      radius: TUMBLE_RADIUS * (0.75 + random() * 0.3),
    }));
  }, []);
  const twigGeometry = useMemo(() => new THREE.TorusGeometry(1, 0.035, 6, 24), []);
  const root = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const body = useRef({ x: -RIM * 0.7, z: 2.5, vx: TUMBLE_SPEED, vz: 0.6, y: 0, vy: 0, held: false });
  const nextHop = useRef(3);

  const { grab, hovered, down, handlers } = useGrab(
    (point) => {
      const b = body.current;
      b.x = point.x;
      b.z = point.z;
      b.y = Math.max(0, point.y - TUMBLE_RADIUS);
      b.held = true;
    },
    () => {
      const b = body.current;
      b.held = false;
      // Roll off in a fresh direction after being dropped.
      const angle = Math.atan2(b.vz, b.vx) + (Math.random() - 0.5) * 1.2;
      b.vx = Math.cos(angle) * TUMBLE_SPEED;
      b.vz = Math.sin(angle) * TUMBLE_SPEED;
    },
  );

  useFrame(({ clock }, delta) => {
    const b = body.current;
    const dt = Math.min(delta, 0.05);
    if (!b.held) {
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      // Bounce off the plaza rim, staying on the disc.
      const d = Math.hypot(b.x, b.z);
      if (d > RIM - TUMBLE_RADIUS) {
        const nx = b.x / d;
        const nz = b.z / d;
        const dot = b.vx * nx + b.vz * nz;
        b.vx -= 2 * dot * nx;
        b.vz -= 2 * dot * nz;
        b.x = nx * (RIM - TUMBLE_RADIUS - 0.01);
        b.z = nz * (RIM - TUMBLE_RADIUS - 0.01);
      }
      // Gravity and the occasional little hop.
      b.vy -= 9 * dt;
      b.y = Math.max(0, b.y + b.vy * dt);
      if (b.y === 0 && b.vy < 0) b.vy = 0;
      if (clock.elapsedTime > nextHop.current && b.y === 0) {
        b.vy = 2.2 + Math.random() * 1.2;
        nextHop.current = clock.elapsedTime + 2.5 + Math.random() * 4;
      }
    }
    if (root.current) root.current.position.set(b.x, b.y + TUMBLE_RADIUS, b.z);
    if (spin.current && !b.held) {
      // Roll about the axis perpendicular to travel; angular speed = linear speed / radius.
      const speed = Math.hypot(b.vx, b.vz);
      spin.current.rotateOnWorldAxis(new THREE.Vector3(b.vz, 0, -b.vx).normalize(), (speed / TUMBLE_RADIUS) * dt);
    }
    if (root.current) {
      const target = grab.current ? 1.15 : hovered.current ? 1.08 : 1;
      root.current.scale.setScalar(THREE.MathUtils.damp(root.current.scale.x, target, 10, delta));
    }
  });

  return (
    <group ref={root} onPointerDown={(event) => down(event, root.current!.position)} {...handlers}>
      {/* Invisible grab sphere so the twiggy ball is easy to catch. */}
      <mesh>
        <sphereGeometry args={[TUMBLE_RADIUS * 1.25, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group ref={spin}>
        {twigs.map((twig, index) => (
          <mesh key={index} geometry={twigGeometry} material={weedMaterial} rotation={twig.rotation} scale={twig.radius} />
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Butterflies: two flapping wings on a lazy figure-eight, above head height.

const BUTTERFLY_COLORS = ["#ffb347", "#8fd1ff", "#ff8fcf"];
const wingGeometry = new THREE.CircleGeometry(0.22, 12);

function Butterfly({ seed, color }: { seed: number; color: string }) {
  const random = useMemo(() => mulberry(seed), [seed]);
  const path = useMemo(() => {
    const cx = (random() - 0.5) * PLAZA.radius * 1.2;
    const cz = (random() - 0.5) * PLAZA.radius * 1.2;
    return { cx, cz, rx: 2.2 + random() * 2, rz: 1.4 + random() * 1.5, y: 2.6 + random() * 1.4, speed: 0.35 + random() * 0.2, phase: random() * Math.PI * 2 };
  }, [random]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide }), [color]);
  const root = useRef<THREE.Group>(null);
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  const offset = useRef(new THREE.Vector3());
  const held = useRef(false);
  const last = useRef(new THREE.Vector3());

  const { grab, hovered, down, handlers } = useGrab(
    (point) => {
      held.current = true;
      if (root.current) root.current.position.copy(point);
    },
    () => {
      held.current = false;
      // Keep flying from where it was dropped: shift the whole path by the drop displacement.
      if (root.current) offset.current.copy(root.current.position).sub(last.current);
    },
  );

  useFrame(({ clock }, delta) => {
    const group = root.current;
    if (!group) return;
    const t = clock.elapsedTime * path.speed + path.phase;
    const flap = Math.sin(clock.elapsedTime * 14) * 0.9;
    if (left.current) left.current.rotation.y = -0.35 - flap * 0.6;
    if (right.current) right.current.rotation.y = 0.35 + flap * 0.6;
    if (!held.current) {
      // Figure-eight (Lissajous 1:2) with a slow bob.
      const x = path.cx + Math.sin(t) * path.rx;
      const z = path.cz + Math.sin(t * 2) * path.rz * 0.5;
      const y = path.y + Math.sin(clock.elapsedTime * 1.3 + path.phase) * 0.25;
      last.current.set(x, y, z);
      const next = last.current.clone().add(offset.current);
      const heading = Math.atan2(next.x - group.position.x, next.z - group.position.z);
      group.position.copy(next);
      if (Number.isFinite(heading)) group.rotation.y = THREE.MathUtils.damp(group.rotation.y, heading, 6, delta);
    }
    const target = grab.current ? 1.4 : hovered.current ? 1.2 : 1;
    group.scale.setScalar(THREE.MathUtils.damp(group.scale.x, target, 10, delta));
  });

  return (
    <group ref={root} position={[path.cx, path.y, path.cz]} onPointerDown={(event) => down(event, root.current!.position)} {...handlers}>
      <mesh>
        <sphereGeometry args={[0.36, 10, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={left} geometry={wingGeometry} material={material} position={[-0.18, 0, 0]} rotation={[0, -0.35, 0]} scale={[1, 0.7, 1]} />
      <mesh ref={right} geometry={wingGeometry} material={material} position={[0.18, 0, 0]} rotation={[0, 0.35, 0]} scale={[1, 0.7, 1]} />
      <mesh>
        <capsuleGeometry args={[0.03, 0.18, 4, 8]} />
        <meshStandardMaterial color="#5a4632" roughness={1} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Leaves: little ovals that spiral down from the sky, land, rest a moment, then start over.

const LEAF_COUNT = 5;
const LEAF_COLORS = ["#d9a066", "#c96f3c", "#e6c36b", "#a8b45f"];
const leafGeometry = new THREE.CircleGeometry(0.16, 10);

function Leaf({ seed }: { seed: number }) {
  const random = useMemo(() => mulberry(seed), [seed]);
  const spec = useMemo(
    () => ({
      x: (random() - 0.5) * PLAZA.radius * 1.6,
      z: (random() - 0.5) * PLAZA.radius * 1.6,
      color: LEAF_COLORS[Math.floor(random() * LEAF_COLORS.length)]!,
      fall: 0.45 + random() * 0.3,
      swirl: 0.9 + random() * 0.6,
      phase: random() * Math.PI * 2,
      start: random() * 10,
    }),
    [random],
  );
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.9, side: THREE.DoubleSide }), [spec.color]);
  const root = useRef<THREE.Group>(null);
  const state = useRef({ y: 7 + spec.start, restUntil: 0, held: false, cx: spec.x, cz: spec.z });

  const { grab, hovered, down, handlers } = useGrab(
    (point) => {
      const s = state.current;
      s.held = true;
      s.cx = point.x;
      s.cz = point.z;
      s.y = Math.max(0.02, point.y);
    },
    () => {
      state.current.held = false;
    },
  );

  useFrame(({ clock }, delta) => {
    const group = root.current;
    if (!group) return;
    const s = state.current;
    const t = clock.elapsedTime;
    if (!s.held) {
      if (s.y > 0.02) {
        s.y -= spec.fall * delta;
        if (s.y <= 0.02) {
          s.y = 0.02;
          s.restUntil = t + 4 + Math.random() * 4;
        }
      } else if (t > s.restUntil) {
        // Blow back up into the sky somewhere new and fall again.
        s.y = 8 + Math.random() * 3;
        s.cx = (Math.random() - 0.5) * PLAZA.radius * 1.6;
        s.cz = (Math.random() - 0.5) * PLAZA.radius * 1.6;
      }
      const swirl = s.y > 0.02 ? 0.6 : 0;
      group.position.set(s.cx + Math.sin(t * spec.swirl + spec.phase) * swirl, s.y, s.cz + Math.cos(t * spec.swirl + spec.phase) * swirl);
      group.rotation.set(s.y > 0.02 ? Math.sin(t * 2 + spec.phase) * 0.8 : -Math.PI / 2, t * spec.swirl, s.y > 0.02 ? Math.cos(t * 1.7 + spec.phase) * 0.6 : 0);
    } else {
      group.position.set(s.cx, s.y, s.cz);
    }
    const target = grab.current ? 1.5 : hovered.current ? 1.25 : 1;
    group.scale.setScalar(THREE.MathUtils.damp(group.scale.x, target, 10, delta));
  });

  return (
    <group ref={root} onPointerDown={(event) => down(event, root.current!.position)} {...handlers}>
      <mesh>
        <sphereGeometry args={[0.32, 8, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh geometry={leafGeometry} material={material} scale={[0.7, 1, 1]} />
    </group>
  );
}

export function PlazaCritters() {
  return (
    <group>
      <Tumbleweed />
      {BUTTERFLY_COLORS.map((color, index) => (
        <Butterfly key={color} seed={21 + index} color={color} />
      ))}
      {Array.from({ length: LEAF_COUNT }, (_, index) => (
        <Leaf key={index} seed={41 + index} />
      ))}
    </group>
  );
}
