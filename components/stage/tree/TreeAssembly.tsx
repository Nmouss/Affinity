"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, PointLight } from "three";
import { TREE } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import { registerTarget } from "@/lib/stage/targets";
import type { CatalogItem } from "@/types/domain";
import { ANCHOR_COUNT, anchorName } from "./anchors";
import { findCatalogItem, lightsStyle, treeHeightFt } from "./catalog";
import { GlbTree, treeModelFor } from "./GlbTree";
import { ProceduralTree } from "./ProceduralTree";
import { TIMING, easeOutBack, progress } from "./timing";

/** Name of the fallback topper node, used when a GLB has no `topper` of its own. */
export const TOPPER_FALLBACK = "topper-fallback";

function AssembledTree({ tree, items }: { tree: CatalogItem; items: CatalogItem[] }) {
  const group = useRef<Group>(null);
  const glow = useRef<PointLight>(null);
  const [mountedAt] = useState(() => performance.now());
  const heightFt = treeHeightFt(tree);
  const lights = lightsStyle(items);
  const lightsId = items.find((item) => item.slot === "lights")?.id ?? null;
  const model = treeModelFor(tree.model ?? findCatalogItem(tree.id)?.model);

  useEffect(() => {
    useStage.getState().setScene({ inspectTarget: [TREE.position[0] + 0.8, heightFt * 0.55, TREE.position[2] + 0.4] });
  }, [heightFt]);

  // Anchors come from whichever model rendered, so GLB and procedural trees register the same way.
  useEffect(() => {
    const root = group.current;
    if (!root) return;
    const cleanups = [registerTarget("tree", root, heightFt * 0.55), registerTarget(`item:${tree.id}`, root, heightFt * 0.55)];
    if (lightsId) cleanups.push(registerTarget(`item:${lightsId}`, root, heightFt * 0.55));
    for (let anchor = 1; anchor <= ANCHOR_COUNT; anchor += 1) {
      const node = root.getObjectByName(anchorName(anchor));
      if (node) cleanups.push(registerTarget(`anchor:${anchor}`, node, 0.35));
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [heightFt, tree.id, lightsId, model]);

  useFrame(() => {
    const grow = easeOutBack(progress(performance.now(), mountedAt, TIMING.treeGrow), 1.4);
    group.current?.scale.setScalar(Math.max(0.001, grow));
    if (glow.current) glow.current.intensity = 7 * Math.min(1, grow);
  });

  return (
    <group ref={group} position={TREE.position}>
      {model ? (
        <Suspense fallback={<ProceduralTree heightFt={heightFt} lights={lights} />}>
          <GlbTree url={model} heightFt={heightFt} />
        </Suspense>
      ) : (
        <ProceduralTree heightFt={heightFt} lights={lights} />
      )}
      <object3D name={TOPPER_FALLBACK} position-y={heightFt * 0.93} />
      <mesh position-y={0.01} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[heightFt * 0.14, heightFt * 0.36, 40]} />
        <meshStandardMaterial color="#b8322e" roughness={0.9} />
      </mesh>
      <pointLight ref={glow} position={[0.6, heightFt * 0.55, 1.2]} color={lights === "multi" ? "#ffd9f0" : "#ffc27a"} intensity={0} distance={0} decay={1.8} />
    </group>
  );
}

/** The bundle's tree, at its true height in the tree corner, scaling in when a bundle lands. */
export function TreeAssembly() {
  const bundle = useStage((state) => state.bundle);
  const tree = bundle?.items.find((item) => item.slot === "tree");
  if (!bundle || !tree) return null;
  return <AssembledTree key={tree.id} tree={tree} items={bundle.items} />;
}
