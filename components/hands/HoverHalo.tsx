"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Vector3, type Mesh, type MeshBasicMaterial } from "three";
import { useStage } from "@/lib/stage/store";
import { getTarget } from "@/lib/stage/targets";

// A pulsing ring on the floor under whatever is hovered, by hand or by Tab, so both look the same.
export function HoverHalo() {
  const halo = useRef<Mesh>(null);
  const position = useMemo(() => new Vector3(), []);
  const fade = useRef(0);

  useFrame(({ clock }, delta) => {
    const mesh = halo.current;
    if (!mesh) return;
    const { hoverTarget } = useStage.getState().hand;
    const target = hoverTarget ? getTarget(hoverTarget) : undefined;
    fade.current += ((target ? 1 : 0) - fade.current) * (1 - Math.exp(-delta * 12));
    mesh.visible = fade.current > 0.02;
    if (target) {
      target.object.getWorldPosition(position);
      mesh.position.set(position.x, 0.04, position.z);
      mesh.scale.setScalar(target.radius * (1 + 0.06 * Math.sin(clock.elapsedTime * 5)));
    }
    (mesh.material as MeshBasicMaterial).opacity = 0.6 * fade.current;
  });

  return (
    <mesh ref={halo} rotation-x={-Math.PI / 2} visible={false}>
      <ringGeometry args={[1.05, 1.25, 64]} />
      <meshBasicMaterial
        color="#ffe2a8"
        transparent
        depthWrite={false}
        toneMapped={false}
        blending={AdditiveBlending}
      />
    </mesh>
  );
}
