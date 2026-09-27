"use client";

import { useMemo } from "react";
import { RoundedBox } from "@react-three/drei";
import { Color } from "three";
import { COUNCIL_RING, ROOM } from "@/lib/stage/layout";
import { WINDOW } from "./RoomShell";
import { rugTexture } from "./textures";

type Vec3 = [number, number, number];

const RUG_RADIUS = 3.6;

/** The round rug the council ring sits on. The sprites track draws the seats and glow above it. */
export function Rug() {
  const texture = useMemo(() => rugTexture(), []);
  const [x, , z] = COUNCIL_RING.center;
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={0.008} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[RUG_RADIUS + 0.12, 72]} />
        <meshStandardMaterial color="#e6d3ae" roughness={1} />
      </mesh>
      <mesh position-y={0.014} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[RUG_RADIUS, 72]} />
        <meshStandardMaterial map={texture} roughness={1} />
      </mesh>
    </group>
  );
}

function Soft({ args, position, color, rotation }: { args: Vec3; position: Vec3; color: string; rotation?: Vec3 }) {
  return (
    <RoundedBox args={args} radius={Math.min(0.12, ...args.map((v) => v / 2 - 0.01))} smoothness={3} position={position} rotation={rotation}>
      <meshStandardMaterial color={color} roughness={0.85} />
    </RoundedBox>
  );
}

function Block({ args, position, color, rotation }: { args: Vec3; position: Vec3; color: string; rotation?: Vec3 }) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
}

/** A three-seat sofa on the right, facing the council. Modeled facing +z, then turned. */
function Sofa() {
  const fabric = "#3f5170";
  return (
    <group position={[8.7, 0, -1]} rotation-y={-Math.PI / 2}>
      {[-2.2, 2.2].flatMap((x) =>
        [-1, 1].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.15, z * 1.05]}>
            <cylinderGeometry args={[0.08, 0.06, 0.3, 8]} />
            <meshStandardMaterial color="#3a2616" />
          </mesh>
        )),
      )}
      <Soft args={[5.2, 0.8, 2.6]} position={[0, 0.7, 0]} color={fabric} />
      <Soft args={[5.2, 1.8, 0.6]} position={[0, 1.8, -1.0]} color={fabric} />
      <Soft args={[0.6, 1.3, 2.6]} position={[-2.6, 1.3, 0]} color={fabric} />
      <Soft args={[0.6, 1.3, 2.6]} position={[2.6, 1.3, 0]} color={fabric} />
      {[-1.4, 0, 1.4].map((x) => (
        <Soft key={x} args={[1.36, 0.36, 1.9]} position={[x, 1.26, 0.25]} color="#4b5f82" />
      ))}
      <Soft args={[0.95, 0.95, 0.3]} position={[-1.7, 1.9, -0.55]} rotation={[-0.2, 0.2, 0.15]} color="#b8322e" />
      <Soft args={[0.9, 0.9, 0.3]} position={[1.7, 1.9, -0.55]} rotation={[-0.2, -0.2, -0.12]} color="#efe1c2" />
    </group>
  );
}

function Doll({ position, dress }: { position: Vec3; dress: string }) {
  return (
    <group position={position}>
      <mesh position-y={0.2}>
        <coneGeometry args={[0.16, 0.4, 10]} />
        <meshStandardMaterial color={dress} roughness={0.6} />
      </mesh>
      <mesh position-y={0.48}>
        <sphereGeometry args={[0.11, 12, 12]} />
        <meshStandardMaterial color="#f5d2b8" roughness={0.6} />
      </mesh>
      <mesh position-y={0.54}>
        <sphereGeometry args={[0.12, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#6b3a1f" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Ava's toy shelf against the back wall. */
function ToyShelf() {
  const white = "#f4efe6";
  const z = ROOM.backWallZ + 0.55;
  const shelves = [0.2, 1.5, 2.8, 4.1];
  return (
    <group position={[6.5, 0, z]}>
      {[-1.8, 1.8].map((x) => (
        <Block key={x} args={[0.12, 4.2, 1.1]} position={[x, 2.1, 0]} color={white} />
      ))}
      <Block args={[3.72, 4.2, 0.08]} position={[0, 2.1, -0.5]} color="#f7d6e6" />
      {shelves.map((y) => (
        <Block key={y} args={[3.6, 0.1, 1.1]} position={[0, y, 0]} color={white} />
      ))}
      <Doll position={[-1.1, 1.55, 0.1]} dress="#ff6fbf" />
      <Doll position={[-0.55, 1.55, 0.1]} dress="#b07cff" />
      <Doll position={[0, 1.55, 0.1]} dress="#ff9fd2" />
      <Block args={[0.7, 0.55, 0.6]} position={[0.9, 1.83, 0]} color="#ff8fcf" />
      <Block args={[0.72, 0.1, 0.62]} position={[0.9, 2.14, 0]} color="#ffe5f5" />
      {/* A doll house on the middle shelf. */}
      <Block args={[1.3, 0.9, 0.8]} position={[-0.6, 3.3, 0]} color="#ffe5f5" />
      <mesh position={[-0.6, 4.0, 0]} rotation-y={Math.PI / 4}>
        <coneGeometry args={[0.95, 0.6, 4]} />
        <meshStandardMaterial color="#e05a9a" roughness={0.7} />
      </mesh>
      <Doll position={[0.7, 2.85, 0.1]} dress="#ff6fbf" />
      {[-1.2, -0.7, -0.2, 0.3].map((x, i) => (
        <Block key={x} args={[0.4, 0.55 + (i % 2) * 0.12, 0.7]} position={[x, 0.53 + (i % 2) * 0.06, 0]} color={["#ffb3de", "#c9a0ff", "#ff8fcf", "#ffe08a"][i]} />
      ))}
    </group>
  );
}

/** Leo's toy chest, with blocks and a ball spilling out. */
function ToyBox() {
  return (
    <group position={[8.7, 0, 3.4]} rotation-y={-0.5}>
      <Block args={[2.2, 1.3, 1.4]} position={[0, 0.65, 0]} color="#2f6fd0" />
      <Block args={[2.3, 0.14, 1.5]} position={[0, 1.36, -0.1]} rotation={[-0.35, 0, 0]} color="#245bb0" />
      <Block args={[2.25, 0.18, 1.45]} position={[0, 1.05, 0]} color="#ffd23f" />
      <mesh position={[-1.5, 0.35, 0.8]}>
        <sphereGeometry args={[0.35, 20, 20]} />
        <meshStandardMaterial color="#e8412f" roughness={0.4} />
      </mesh>
      {[
        [0.9, 0.2, 1.1, "#45d483"],
        [1.3, 0.2, 0.9, "#ffd23f"],
        [1.1, 0.6, 1.0, "#e8412f"],
      ].map(([x, y, z, color], index) => (
        <Block key={index} args={[0.4, 0.4, 0.4]} position={[x as number, y as number, z as number]} rotation={[0, index * 0.5, 0]} color={color as string} />
      ))}
    </group>
  );
}

/** Maya's window seat under the left-wall window. */
function WindowSeat() {
  const zCenter = (WINDOW.zMin + WINDOW.zMax) / 2;
  const length = WINDOW.zMax - WINDOW.zMin + 0.4;
  const x = ROOM.leftWallX + 0.65;
  return (
    <group position={[x, 0, zCenter]}>
      <Block args={[1.3, 1.5, length]} position={[0, 0.75, 0]} color="#efe4d0" />
      <Soft args={[1.3, 0.3, length]} position={[0.02, 1.64, 0]} color="#f5ecd9" />
      <Soft args={[0.3, 0.9, 0.9]} position={[-0.4, 2.2, -1.2]} rotation={[0, 0, -0.2]} color="#c9a227" />
      <Soft args={[0.3, 0.85, 0.85]} position={[-0.4, 2.18, -0.2]} rotation={[0.1, 0, -0.2]} color="#fff4d6" />
    </group>
  );
}

/** Warm reading lamp in the back-right corner. */
function FloorLamp() {
  return (
    <group position={[9.1, 0, -5.4]}>
      <mesh position-y={0.05}>
        <cylinderGeometry args={[0.45, 0.5, 0.1, 20]} />
        <meshStandardMaterial color="#2a2a2a" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position-y={2.7}>
        <cylinderGeometry args={[0.04, 0.04, 5.3, 8]} />
        <meshStandardMaterial color="#2a2a2a" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position-y={5.35}>
        <cylinderGeometry args={[0.5, 0.8, 0.9, 24, 1, true]} />
        <meshStandardMaterial color="#f3dcae" emissive={new Color("#ffc27a")} emissiveIntensity={1.4} side={2} />
      </mesh>
      <pointLight position={[0, 5.0, 0]} color="#ffc27a" intensity={9} distance={0} decay={1.6} />
    </group>
  );
}

export function Furniture() {
  return (
    <group>
      <Sofa />
      <ToyShelf />
      <ToyBox />
      <WindowSeat />
      <FloorLamp />
    </group>
  );
}
