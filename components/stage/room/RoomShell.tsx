"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, PlaneGeometry, type Group } from "three";
import { ROOM } from "@/lib/stage/layout";
import { Snow } from "./Snow";
import { nightSkyTexture, wallpaperTexture, woodFloorTexture } from "./textures";

/** Left-wall window opening, in ft. */
export const WINDOW = { zMin: -5.6, zMax: -1.4, yMin: 2.6, yMax: 6.6 } as const;

const WALLPAPER_TILE = 4;
const TRIM = "#efe4d0";

/** A wall rectangle whose UVs follow world ft, so the wallpaper lines up across panels. */
function wallGeometry(u0: number, u1: number, v0: number, v1: number): PlaneGeometry {
  const geometry = new PlaneGeometry(u1 - u0, v1 - v0);
  const uv = geometry.attributes.uv as BufferAttribute;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, (u0 + uv.getX(i) * (u1 - u0)) / WALLPAPER_TILE, (v0 + uv.getY(i) * (v1 - v0)) / WALLPAPER_TILE);
  }
  return geometry;
}

function Trim({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={TRIM} roughness={0.6} />
    </mesh>
  );
}

function LeftWall() {
  const wallpaper = useMemo(() => wallpaperTexture(), []);
  // Panels are laid out in the wall's own plane: u runs along +z, v up.
  const panels = useMemo(() => {
    const zBack = ROOM.backWallZ;
    const zFront = ROOM.backWallZ + ROOM.depth;
    const rects: Array<[number, number, number, number]> = [
      [zBack, WINDOW.zMin, 0, ROOM.height],
      [WINDOW.zMax, zFront, 0, ROOM.height],
      [WINDOW.zMin, WINDOW.zMax, 0, WINDOW.yMin],
      [WINDOW.zMin, WINDOW.zMax, WINDOW.yMax, ROOM.height],
    ];
    return rects.map(([u0, u1, v0, v1]) => ({
      geometry: wallGeometry(u0, u1, v0, v1),
      center: [(u0 + u1) / 2, (v0 + v1) / 2] as const,
    }));
  }, []);

  const x = ROOM.leftWallX;
  const wz = (WINDOW.zMin + WINDOW.zMax) / 2;
  const wy = (WINDOW.yMin + WINDOW.yMax) / 2;
  const ww = WINDOW.zMax - WINDOW.zMin;
  const wh = WINDOW.yMax - WINDOW.yMin;
  return (
    <group>
      {panels.map(({ geometry, center }, index) => (
        // The plane faces +x after this rotation, so its local +x runs toward -z; mirror u with scale.
        <mesh key={index} geometry={geometry} position={[x, center[1], center[0]]} rotation-y={Math.PI / 2} scale-x={-1}>
          <meshStandardMaterial map={wallpaper} roughness={0.9} />
        </mesh>
      ))}
      <Trim position={[x + 0.06, 0.22, 0]} size={[0.12, 0.44, ROOM.depth]} />
      <Trim position={[x + 0.05, ROOM.height - 0.15, 0]} size={[0.1, 0.3, ROOM.depth]} />
      {/* Window: sill, header, jambs, muntins, and a deep night pane. */}
      <Trim position={[x + 0.25, WINDOW.yMin - 0.06, wz]} size={[0.55, 0.12, ww + 0.6]} />
      <Trim position={[x + 0.08, WINDOW.yMax + 0.08, wz]} size={[0.2, 0.2, ww + 0.4]} />
      <Trim position={[x + 0.08, wy, WINDOW.zMin - 0.1]} size={[0.2, wh + 0.2, 0.2]} />
      <Trim position={[x + 0.08, wy, WINDOW.zMax + 0.1]} size={[0.2, wh + 0.2, 0.2]} />
      <Trim position={[x, wy, wz]} size={[0.08, wh, 0.08]} />
      <Trim position={[x, wy, wz]} size={[0.08, 0.08, ww]} />
      <mesh position={[x - 0.02, wy, wz]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[ww, wh]} />
        <meshStandardMaterial color="#1c3470" transparent opacity={0.22} roughness={0.05} metalness={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}

function BackWall() {
  const wallpaper = useMemo(() => wallpaperTexture(), []);
  const geometry = useMemo(
    () => wallGeometry(ROOM.leftWallX, ROOM.leftWallX + ROOM.width, 0, ROOM.height),
    [],
  );
  const z = ROOM.backWallZ;
  return (
    <group>
      <mesh geometry={geometry} position={[ROOM.leftWallX + ROOM.width / 2, ROOM.height / 2, z]}>
        <meshStandardMaterial map={wallpaper} roughness={0.9} />
      </mesh>
      <Trim position={[0, 0.22, z + 0.06]} size={[ROOM.width, 0.44, 0.12]} />
      <Trim position={[0, ROOM.height - 0.15, z + 0.05]} size={[ROOM.width, 0.3, 0.1]} />
    </group>
  );
}

/** What the window looks out on: sky, snowy ground, a few pines, and falling snow. */
function Outside() {
  const sky = useMemo(() => nightSkyTexture(), []);
  const pines: Array<[number, number, number]> = [
    [-14, 0, -6.5],
    [-16.5, 0, -2.5],
    [-13, 0, 0.5],
  ];
  return (
    <group>
      <mesh position={[-22, 5, -3]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[40, 22]} />
        <meshBasicMaterial map={sky} />
      </mesh>
      <mesh position={[-16, -0.4, -3]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[12, 30]} />
        <meshStandardMaterial color="#c9d8f2" roughness={1} />
      </mesh>
      {pines.map((position, index) => (
        <group key={index} position={position}>
          <mesh position-y={2.5 + index * 0.4}>
            <coneGeometry args={[1.4, 5 + index * 0.8, 7]} />
            <meshStandardMaterial color="#0f2a24" roughness={1} />
          </mesh>
        </group>
      ))}
      <Snow />
    </group>
  );
}

export function RoomShell() {
  const floor = useMemo(() => woodFloorTexture(), []);
  const back = useRef<Group>(null);
  const left = useRef<Group>(null);
  const ceiling = useRef<Group>(null);

  // Dollhouse cutaway: a wall disappears when the orbiting camera swings behind it.
  useFrame(({ camera }) => {
    if (back.current) back.current.visible = camera.position.z > ROOM.backWallZ + 0.2;
    if (left.current) left.current.visible = camera.position.x > ROOM.leftWallX + 0.2;
    if (ceiling.current) ceiling.current.visible = camera.position.y < ROOM.height - 0.2;
  });

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[ROOM.leftWallX + ROOM.width / 2, 0, ROOM.backWallZ + ROOM.depth / 2]}>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshStandardMaterial map={floor} roughness={0.55} metalness={0.05} />
      </mesh>
      <group ref={back}>
        <BackWall />
      </group>
      <group ref={left}>
        <LeftWall />
      </group>
      <group ref={ceiling}>
        <mesh rotation-x={Math.PI / 2} position={[ROOM.leftWallX + ROOM.width / 2, ROOM.height, ROOM.backWallZ + ROOM.depth / 2]}>
          <planeGeometry args={[ROOM.width, ROOM.depth]} />
          <meshStandardMaterial color="#3a2a20" roughness={1} />
        </mesh>
      </group>
      <Outside />
    </group>
  );
}
