"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { BufferAttribute, Points } from "three";
import { ROOM } from "@/lib/stage/layout";
import { flakeTexture } from "./textures";

const COUNT = 520;
/** Volume outside the left-wall window, in ft. */
const BOX = { x: [-17, -10.4], y: [-0.4, 10], z: [-8, 1] } as const;

function span([min, max]: readonly [number, number]): number {
  return max - min;
}

/** Snow outside the window: one Points draw call, positions advanced on the CPU. */
export function Snow() {
  const points = useRef<Points>(null);
  const texture = useMemo(() => flakeTexture(), []);
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i += 1) {
      positions[i * 3] = BOX.x[0] + Math.random() * span(BOX.x);
      positions[i * 3 + 1] = BOX.y[0] + Math.random() * span(BOX.y);
      positions[i * 3 + 2] = BOX.z[0] + Math.random() * span(BOX.z);
      speeds[i] = 0.6 + Math.random() * 0.9;
    }
    return { positions, speeds };
  }, []);

  useFrame(({ clock, camera }, delta) => {
    const attribute = points.current?.geometry.attributes.position as BufferAttribute | undefined;
    if (!attribute || !points.current) return;
    // When the orbit swings the camera out past the left wall, it would be standing in the snow.
    points.current.visible = camera.position.x > ROOM.leftWallX;
    if (!points.current.visible) return;
    const dt = Math.min(delta, 0.1);
    const time = clock.elapsedTime;
    for (let i = 0; i < COUNT; i += 1) {
      const y = positions[i * 3 + 1] - speeds[i] * dt;
      positions[i * 3 + 1] = y < BOX.y[0] ? BOX.y[1] : y;
      positions[i * 3 + 2] += Math.sin(time * 0.8 + i) * 0.25 * dt;
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial map={texture} size={0.16} sizeAttenuation transparent depthWrite={false} color="#eef4ff" />
    </points>
  );
}
