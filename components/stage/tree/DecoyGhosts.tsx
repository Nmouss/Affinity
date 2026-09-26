"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, MeshBasicMaterial, type Group } from "three";
import { TREE, type Vec3 } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import type { CatalogItem } from "@/types/domain";
import { treeTiers } from "./anchors";
import { CATALOG, deriveDecoys, effectiveHardRules, inchesToFeet, maxHeightInches } from "./catalog";
import { TIMING, easeOutBack, easeOutCubic, progress } from "./timing";
import styles from "./labels.module.css";

/** Either side of the (still empty) tree spot. */
const GHOST_SPOTS: Vec3[] = [
  [TREE.position[0] - 1.9, 0, TREE.position[2] + 0.5],
  [TREE.position[0] + 1.7, 0, TREE.position[2] + 0.4],
  [TREE.position[0], 0, TREE.position[2] + 1.8],
];
const GHOST_BLUE = new Color("#bcd8ff");
const GHOST_RED = new Color("#ff7070");
const CROSS_RED = new Color("#ff1a1a").multiplyScalar(1.8);

function Ghost({ item, index, startedAt, limitFt }: { item: CatalogItem; index: number; startedAt: number; limitFt: number }) {
  const heightFt = inchesToFeet(item.heightIn ?? 72);
  const tiers = useMemo(() => treeTiers(heightFt), [heightFt]);
  const material = useMemo(
    () => new MeshBasicMaterial({ color: GHOST_BLUE, transparent: true, opacity: 0.3, depthWrite: false, blending: AdditiveBlending }),
    [],
  );
  const crossMaterial = useMemo(() => new MeshBasicMaterial({ color: CROSS_RED, transparent: true, toneMapped: false }), []);
  useEffect(
    () => () => {
      material.dispose();
      crossMaterial.dispose();
    },
    [material, crossMaterial],
  );
  const body = useRef<Group>(null);
  const cross = useRef<Group>(null);
  const start = startedAt + index * TIMING.ghostStagger;
  const crossY = limitFt + (heightFt - limitFt) * 0.55;

  useFrame(() => {
    const now = performance.now();
    const rise = easeOutCubic(progress(now, start, TIMING.ghostRise));
    const crossed = progress(now, start + TIMING.ghostCross, 300);
    const fade = 1 - progress(now, start + TIMING.ghostFadeStart, TIMING.ghostFade);
    body.current?.scale.set(1, Math.max(0.001, rise), 1);
    material.color.copy(GHOST_BLUE).lerp(GHOST_RED, crossed);
    material.opacity = 0.32 * fade;
    cross.current?.scale.setScalar(Math.max(0.001, easeOutBack(crossed, 2.5)));
    crossMaterial.opacity = fade;
  });

  const [x, , z] = GHOST_SPOTS[index % GHOST_SPOTS.length];
  return (
    <group position={[x, 0, z]}>
      <group ref={body}>
        {tiers.map((tier, tierIndex) => (
          <mesh key={tierIndex} material={material} position-y={(tier.bottom + tier.top) / 2}>
            <coneGeometry args={[tier.radius, tier.top - tier.bottom, 9, 1, true]} />
          </mesh>
        ))}
      </group>
      <group ref={cross} position={[0, crossY, 0.8]}>
        {[1, -1].map((side) => (
          <mesh key={side} material={crossMaterial} rotation-z={(side * Math.PI) / 4}>
            <boxGeometry args={[2.2, 0.26, 0.08]} />
          </mesh>
        ))}
      </group>
      <Html center position={[0, heightFt + 0.4, 0]} zIndexRange={[25, 5]}>
        <div className={styles.ghostLabel} style={{ animationDelay: `${index * TIMING.ghostStagger + TIMING.ghostRise * 0.6}ms` }}>
          {heightFt} ft ✗
        </div>
      </Html>
    </group>
  );
}

function GhostParade({ decoys, limitFt }: { decoys: CatalogItem[]; limitFt: number }) {
  const [startedAt] = useState(() => performance.now());
  const [done, setDone] = useState(false);
  useEffect(() => {
    const total = TIMING.ghostFadeStart + TIMING.ghostFade + decoys.length * TIMING.ghostStagger + 200;
    const timer = window.setTimeout(() => setDone(true), total);
    return () => window.clearTimeout(timer);
  }, [decoys.length]);
  if (done) return null;
  return (
    <group>
      {decoys.map((item, index) => (
        <Ghost key={item.id} item={item} index={index} startedAt={startedAt} limitFt={limitFt} />
      ))}
    </group>
  );
}

/**
 * When a height rule appears, the catalog trees it rules out rise as ghosts past the red line, get
 * crossed out, and fade.
 */
export function DecoyGhosts() {
  const constraints = useStage((state) => state.constraints);
  const opinions = useStage((state) => state.opinions);
  const rules = useMemo(() => effectiveHardRules(constraints, opinions), [constraints, opinions]);
  const limit = maxHeightInches(rules);
  const decoys = useMemo(() => deriveDecoys(CATALOG, rules), [rules]);
  if (limit === null || decoys.length === 0) return null;
  return <GhostParade key={limit} decoys={decoys} limitFt={inchesToFeet(limit)} />;
}
