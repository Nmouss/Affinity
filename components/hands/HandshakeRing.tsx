"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, DoubleSide, RingGeometry, Vector3, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { useStage } from "@/lib/stage/store";
import { getTargetWorldPosition } from "@/lib/stage/targets";
import { createTextLabel } from "./textLabel";

// The approval ring. It hangs around the tree when the tree target exists, otherwise in front of the
// camera, and its arc fills from hand.handshakeProgress (hand, Space, or the approve button alike).

const SEGMENTS = 128;
/** Indices per theta segment of a RingGeometry with one phi segment. */
const INDICES_PER_SEGMENT = 6;
const TREE_CENTER_HEIGHT = 2.2;
const TREE_RING_RADIUS = 2.8;
const CAMERA_DISTANCE = 7;
const CAMERA_RING_RADIUS = 1.6;
const FILL = new Color("#ffd18a");
const DONE = new Color("#fff8e6");
/** Label height in ring radii. */
const LABEL_HEIGHT = 0.2;

function labelText(percent: number): string {
  if (percent >= 100) return "Approved";
  return percent > 0 ? `Approving… ${percent}%` : "Shake hands to approve";
}

export function HandshakeRing({ visible }: { visible: boolean }) {
  const group = useRef<Group>(null);
  const arc = useRef<Mesh>(null);
  const shownPercent = useRef(-1);
  const label = useMemo(() => createTextLabel(), []);
  const scratch = useMemo(() => ({ tree: new Vector3(), forward: new Vector3() }), []);
  // Starts at 12 o'clock; mirrored on x below so it fills clockwise.
  const arcGeometry = useMemo(() => new RingGeometry(0.9, 1, SEGMENTS, 1, Math.PI / 2, Math.PI * 2), []);

  useFrame(({ camera }) => {
    const root = group.current;
    if (!root || !arc.current) return;
    root.visible = visible;
    if (!visible) {
      shownPercent.current = -1;
      return;
    }

    const tree = getTargetWorldPosition("tree", scratch.tree);
    if (tree) {
      // The tree may register its base (on the floor) or its middle; center the ring on the middle.
      root.position.set(tree.x, tree.y < 1 ? tree.y + TREE_CENTER_HEIGHT : tree.y, tree.z);
      root.scale.set(TREE_RING_RADIUS, TREE_RING_RADIUS, TREE_RING_RADIUS);
    } else {
      camera.getWorldDirection(scratch.forward);
      root.position.copy(camera.position).addScaledVector(scratch.forward, CAMERA_DISTANCE);
      root.scale.set(CAMERA_RING_RADIUS, CAMERA_RING_RADIUS, CAMERA_RING_RADIUS);
    }
    root.quaternion.copy(camera.quaternion);

    const progress = useStage.getState().hand.handshakeProgress;
    arcGeometry.setDrawRange(0, Math.round(SEGMENTS * progress) * INDICES_PER_SEGMENT);
    const material = arc.current.material as MeshBasicMaterial;
    material.color.copy(progress >= 1 ? DONE : FILL);

    const percent = Math.round(progress * 100);
    if (percent !== shownPercent.current) {
      shownPercent.current = percent;
      label.draw(labelText(percent));
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh renderOrder={15}>
        <ringGeometry args={[0.9, 1, SEGMENTS]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.12} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={arc} geometry={arcGeometry} scale-x={-1} renderOrder={16}>
        <meshBasicMaterial
          color={FILL}
          transparent
          opacity={0.95}
          side={DoubleSide}
          depthWrite={false}
          toneMapped={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh position={[0, -1.25, 0]} scale={[LABEL_HEIGHT * label.aspect, LABEL_HEIGHT, 1]} renderOrder={17}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={label.texture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
