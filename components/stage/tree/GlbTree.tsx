"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Box3, Vector3 } from "three";

/**
 * Tree GLBs actually present in public/models. We never probe the network for them, so add a path
 * here when its file lands (anchors must be named ornament_01…ornament_12, optionally a `topper`).
 */
export const AVAILABLE_TREE_MODELS = new Set<string>([]);

export function treeModelFor(model: string | undefined): string | null {
  return model && AVAILABLE_TREE_MODELS.has(model) ? model : null;
}

/** A tree GLB scaled to its catalog height and set on the floor. */
export function GlbTree({ url, heightFt }: { url: string; heightFt: number }) {
  const { scene } = useGLTF(url);
  const { model, scale, offsetY } = useMemo(() => {
    const model = scene.clone(true);
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const scale = size.y > 0 ? heightFt / size.y : 1;
    return { model, scale, offsetY: -box.min.y * scale };
  }, [scene, heightFt]);

  return (
    <group position-y={offsetY} scale={scale}>
      <primitive object={model} />
    </group>
  );
}
