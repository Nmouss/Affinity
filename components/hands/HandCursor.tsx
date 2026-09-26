"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, Vector3, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { useStage } from "@/lib/stage/store";
import { getTargetWorldPosition } from "@/lib/stage/targets";
import { glowTexture } from "./glowTexture";
import { pointerDirection } from "./projection";

// The hand's cursor on the pointer ray (a ring that closes as the pinch tightens), its glow on the
// floor, and a faint ghost hand from the fingertips. Keyboard hover parks the cursor on the target.

const IDLE = new Color("#ffd18a");
const HOT = new Color("#fff4d6");
const HELD = new Color("#ff8fcf");
const FINGERS = 5;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export function HandCursor({ distance, ghost }: { distance: number; ghost: boolean }) {
  const cursor = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const dot = useRef<Mesh>(null);
  const floorGlow = useRef<Mesh>(null);
  const fingers = useRef<Array<Mesh | null>>([]);
  const glow = useMemo(() => glowTexture(), []);
  const scratch = useMemo(() => ({ dir: new Vector3(), target: new Vector3(), aim: new Vector3() }), []);
  const eased = useRef({ pinch: 0, visible: 0 });

  useFrame(({ camera }, delta) => {
    const { hand } = useStage.getState();
    const e = eased.current;
    const tracking = hand.present && hand.source !== "keyboard";
    const keyboardAim = !tracking && hand.hoverTarget ? getTargetWorldPosition(hand.hoverTarget, scratch.target) : null;
    const show = tracking || keyboardAim !== null;
    const k = 1 - Math.exp(-delta * 14);
    e.visible += ((show ? 1 : 0) - e.visible) * k;
    e.pinch += (smoothstep(0.3, 0.9, tracking ? hand.pinch : 0) - e.pinch) * k;

    if (cursor.current && ring.current && dot.current) {
      cursor.current.visible = e.visible > 0.02;
      if (keyboardAim) {
        scratch.aim.copy(keyboardAim).sub(camera.position).normalize();
        scratch.dir.lerp(scratch.aim, k).normalize();
      } else if (tracking) {
        pointerDirection(camera, hand.pointer, scratch.dir);
      }
      cursor.current.position.copy(camera.position).addScaledVector(scratch.dir, distance);
      cursor.current.quaternion.copy(camera.quaternion);
      const hovering = hand.hoverTarget !== null;
      const scale = (hovering ? 1.15 : 1) * (1 - 0.55 * e.pinch) * (0.6 + 0.4 * e.visible);
      ring.current.scale.setScalar(scale);
      const ringMaterial = ring.current.material as MeshBasicMaterial;
      ringMaterial.color.copy(hand.draggingSpriteId ? HELD : hovering ? HOT : IDLE);
      ringMaterial.opacity = e.visible * (0.55 + 0.45 * e.pinch);
      (dot.current.material as MeshBasicMaterial).opacity = e.visible * (0.35 + 0.65 * e.pinch);
    }

    if (floorGlow.current) {
      const point = tracking ? hand.floorPoint : null;
      floorGlow.current.visible = point !== null;
      if (point) {
        floorGlow.current.position.set(point[0], 0.03, point[2]);
        floorGlow.current.scale.setScalar(hand.draggingSpriteId ? 2.6 : 1.6);
      }
    }

    const joints = tracking && ghost ? hand.joints : null;
    for (let index = 0; index < FINGERS; index += 1) {
      const finger = fingers.current[index];
      const joint = joints?.[index];
      if (!finger) continue;
      finger.visible = joint !== undefined;
      if (joint) finger.position.set(joint[0], joint[1], joint[2]);
    }
  });

  return (
    <group>
      <group ref={cursor} renderOrder={20}>
        <mesh ref={ring} renderOrder={20}>
          <ringGeometry args={[0.16, 0.21, 48]} />
          <meshBasicMaterial
            color={IDLE}
            transparent
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
            blending={AdditiveBlending}
          />
        </mesh>
        <mesh ref={dot} renderOrder={20}>
          <circleGeometry args={[0.05, 24]} />
          <meshBasicMaterial color={HOT} transparent depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh renderOrder={19} scale={0.9}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={glow}
            color={IDLE}
            transparent
            opacity={0.35}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
            blending={AdditiveBlending}
          />
        </mesh>
      </group>
      <mesh ref={floorGlow} rotation-x={-Math.PI / 2} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={glow}
          color={IDLE}
          transparent
          opacity={0.5}
          depthWrite={false}
          toneMapped={false}
          blending={AdditiveBlending}
        />
      </mesh>
      {Array.from({ length: FINGERS }, (_, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            fingers.current[index] = mesh;
          }}
          visible={false}
          renderOrder={18}
        >
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshBasicMaterial color={HOT} transparent opacity={0.3} depthTest={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
