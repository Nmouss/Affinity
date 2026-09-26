"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { StatsGl } from "@react-three/drei";
import { Leva } from "leva";
import { HandLayer } from "@/components/hands/HandLayer";
import { SpriteLayer } from "@/components/sprites/SpriteLayer";
import { RoomLayer } from "@/components/stage/room/RoomLayer";
import { CAMERA } from "@/lib/stage/layout";

// Frozen seam: each layer below belongs to one track (room, sprites, hands).
export default function StageCanvas({ lab = false }: { lab?: boolean }) {
  return (
    <>
      <Leva hidden={!lab} collapsed />
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: CAMERA.position, fov: CAMERA.fov, near: 0.1, far: 200 }}
        onCreated={({ camera }) => camera.lookAt(...CAMERA.target)}
      >
        <Suspense fallback={null}>
          <RoomLayer />
          <SpriteLayer />
          <HandLayer />
        </Suspense>
        {lab && <StatsGl />}
      </Canvas>
    </>
  );
}
