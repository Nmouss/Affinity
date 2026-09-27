"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Color, type Group, type Mesh, type MeshStandardMaterial } from "three";
import { getPerson } from "@/lib/people/roster";
import type { ConflictBeat } from "@/lib/stage/slices/scene";
import { useStage } from "@/lib/stage/store";
import { registerTarget } from "@/lib/stage/targets";
import type { Vec3 } from "@/lib/stage/layout";
import {
  effectiveHardRules,
  findCatalogItem,
  heightRuleAuthor,
  inchesToFeet,
  isDinoItem,
  maxHeightInches,
  wishAuthor,
} from "./catalog";
import { DINO_GREEN, LowPolyDino } from "./LowPolyDino";
import { TIMING, easeInBack, easeOutBack, easeOutElastic, progress } from "./timing";
import styles from "./labels.module.css";

/** Between the tree corner and the hearth, in front of the rule line on the back wall. */
export const VETO_SPOT: Vec3 = [-3.1, 0, -5.1];
const BOX_OFFSET: Vec3 = [0.5, 0, 1.2];
const REX_YAW = 0.55;
const STAMP_OUT_MS = 500;
const RED = new Color("#ff2a2a");
/** The inflatable glows faintly from inside so it reads against the fire's backlight. */
const INNER_GLOW = new Color("#4fd060");
const scratchColor = new Color();

type Stage = "inflating" | "stamped" | "unstamping" | "resolving" | "done";

function stageAt(beat: ConflictBeat, now: number): Stage {
  if (beat.resolveAt !== null && now >= beat.resolveAt + TIMING.boxExit + 600) return "done";
  if (beat.resolveAt !== null && now >= beat.resolveAt + STAMP_OUT_MS) return "resolving";
  if (beat.resolveAt !== null && now >= beat.resolveAt) return "unstamping";
  if (now >= beat.startedAt + TIMING.vetoStamp) return "stamped";
  return "inflating";
}

/** React-side stage for the DOM overlays, advanced by timers at each boundary. */
function useBeatStage(beat: ConflictBeat): Stage {
  const [stage, setStage] = useState<Stage>(() => stageAt(beat, performance.now()));
  useEffect(() => {
    const now = performance.now();
    setStage(stageAt(beat, now));
    const boundaries = [beat.startedAt + TIMING.vetoStamp];
    if (beat.resolveAt !== null) boundaries.push(beat.resolveAt, beat.resolveAt + STAMP_OUT_MS, beat.resolveAt + TIMING.boxExit + 600);
    const timers = boundaries
      .filter((at) => at > now)
      .map((at) => window.setTimeout(() => setStage(stageAt(beat, performance.now())), at - now + 5));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [beat]);
  return stage;
}

function nameOf(spriteId: string | null): string | null {
  return spriteId ? (getPerson(spriteId)?.name ?? null) : null;
}

/** A red-and-white inflatable for vetoed items that are not dinosaurs (the Santa decoy). */
function GenericInflatable() {
  return (
    <group>
      <mesh position-y={0.35}>
        <capsuleGeometry args={[0.28, 0.35, 6, 12]} />
        <meshStandardMaterial color="#d8322d" roughness={0.35} flatShading />
      </mesh>
      <mesh position-y={0.82}>
        <sphereGeometry args={[0.17, 12, 10]} />
        <meshStandardMaterial color="#f5d2b8" roughness={0.35} flatShading />
      </mesh>
      <mesh position-y={0.97}>
        <coneGeometry args={[0.16, 0.25, 10]} />
        <meshStandardMaterial color="#d8322d" roughness={0.35} flatShading />
      </mesh>
    </group>
  );
}

/** The ornament set the vetoed item turns into: a gift box that pops open to release it. */
function OrnamentBox({ lid }: { lid: RefObject<Group | null> }) {
  return (
    <group>
      <mesh position-y={0.32}>
        <boxGeometry args={[1.0, 0.64, 0.8]} />
        <meshStandardMaterial color="#5fd46e" emissive="#3fae4a" emissiveIntensity={0.35} roughness={0.5} />
      </mesh>
      <mesh position-y={0.32}>
        <boxGeometry args={[0.18, 0.66, 0.82]} />
        <meshStandardMaterial color="#ffd23f" emissive="#ffb000" emissiveIntensity={0.3} roughness={0.4} />
      </mesh>
      <group ref={lid} position={[0, 0.64, -0.4]}>
        <mesh position={[0, 0.06, 0.4]}>
          <boxGeometry args={[1.08, 0.13, 0.88]} />
          <meshStandardMaterial color="#3fae4a" emissive="#3fae4a" emissiveIntensity={0.3} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.06, 0.4]}>
          <boxGeometry args={[0.2, 0.15, 0.9]} />
          <meshStandardMaterial color="#ffd23f" emissive="#ffb000" emissiveIntensity={0.3} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

function VetoStage({ beat }: { beat: ConflictBeat }) {
  const stage = useBeatStage(beat);
  const veto = useStage((state) => state.veto);
  const conflict = useStage((state) => state.conflict);
  const opinions = useStage((state) => state.opinions);
  const constraints = useStage((state) => state.constraints);

  const item = findCatalogItem(beat.itemId);
  const heightFt = inchesToFeet(item?.heightIn ?? 96);
  const dino = item ? isDinoItem(item) : true;
  const resolved = findCatalogItem(beat.resolvedItemId);
  const limitIn = maxHeightInches(effectiveHardRules(constraints, opinions));
  const ruleBy = nameOf(conflict?.ruleBy ?? heightRuleAuthor(opinions, limitIn));
  const wishBy = nameOf(conflict?.wishBy ?? (item ? wishAuthor(opinions, item) : null));

  const rex = useRef<Group>(null);
  const body = useRef<Group>(null);
  const box = useRef<Group>(null);
  const lid = useRef<Group>(null);
  const unregisterRex = useRef<(() => void) | null>(null);
  const unregisterBox = useRef<(() => void) | null>(null);
  const materials = useRef<MeshStandardMaterial[]>([]);

  useEffect(() => {
    const collected: MeshStandardMaterial[] = [];
    body.current?.traverse((object) => {
      const material = (object as Mesh).material as MeshStandardMaterial | undefined;
      if (material && "emissive" in material) collected.push(material);
    });
    materials.current = collected;
    if (rex.current) unregisterRex.current = registerTarget(`item:${beat.itemId}`, rex.current, heightFt * 0.45);
    return () => {
      unregisterRex.current?.();
      unregisterBox.current?.();
    };
  }, [beat.itemId, heightFt]);

  useFrame(({ clock }) => {
    const current = useStage.getState().scene.conflictBeat ?? beat;
    const now = performance.now();
    const time = clock.elapsedTime;
    const rexGroup = rex.current;
    const boxGroup = box.current;
    if (!rexGroup || !boxGroup) return;

    // Inflate with an elastic wobble, then sway like an inflatable in a draft.
    const inflate = Math.max(0.02, easeOutElastic(progress(now, current.startedAt, TIMING.vetoInflate)));
    const sinceStamp = now - (current.startedAt + TIMING.vetoStamp);
    const squash = sinceStamp >= 0 && sinceStamp < 350 ? Math.sin((sinceStamp / 350) * Math.PI) * 0.14 : 0;
    const shrink = current.resolveAt === null ? 0 : progress(now, current.resolveAt, TIMING.vetoShrink);
    const size = inflate * (1 - easeInBack(shrink, 2.2));

    rexGroup.visible = shrink < 1;
    rexGroup.scale.set(size * (1 + squash * 0.6), size * (1 - squash) * (1 + Math.sin(time * 2.3) * 0.012), size * (1 + squash * 0.6));
    rexGroup.rotation.set(0, REX_YAW + shrink * Math.PI * 2.5, Math.sin(time * 1.6) * 0.03 * (1 - shrink));
    rexGroup.position.set(
      VETO_SPOT[0] + BOX_OFFSET[0] * shrink + (sinceStamp >= 0 && sinceStamp < 300 ? Math.sin(sinceStamp * 0.12) * 0.08 : 0),
      shrink * 0.6,
      VETO_SPOT[2] + BOX_OFFSET[2] * shrink,
    );
    if (shrink >= 1 && unregisterRex.current) {
      unregisterRex.current();
      unregisterRex.current = null;
    }

    // Red flash on the stamp, settling into a faint blush.
    const flash = sinceStamp < 0 ? 0 : Math.max(0, 1 - sinceStamp / 700);
    for (const material of materials.current) {
      // Summed rather than lerped: green-to-red passes through a muddy olive.
      material.emissive.copy(INNER_GLOW).multiplyScalar(0.3 * (1 - flash)).add(scratchColor.copy(RED).multiplyScalar(flash));
      material.emissiveIntensity = 1 - shrink;
    }

    // The ornament box pops in under the shrinking T-rex, opens, then leaves once its ornaments fly.
    if (current.resolveAt === null) {
      boxGroup.visible = false;
      return;
    }
    const pop = easeOutBack(progress(now, current.resolveAt + TIMING.boxPop, 420), 2);
    const exit = progress(now, current.resolveAt + TIMING.boxExit, 500);
    boxGroup.visible = pop > 0 && exit < 1;
    boxGroup.scale.setScalar(Math.max(0.001, pop * (1 - easeInBack(exit))));
    boxGroup.rotation.y = REX_YAW * 0.5 + Math.sin(time * 3) * 0.04 * (1 - exit);
    if (lid.current) lid.current.rotation.x = -1.9 * easeOutBack(progress(now, current.resolveAt + TIMING.boxRelease - 200, 320));
    if (pop > 0 && exit < 1 && !unregisterBox.current) {
      unregisterBox.current = registerTarget(`item:${current.resolvedItemId}`, boxGroup, 0.9);
    }
    if (exit >= 1 && unregisterBox.current) {
      unregisterBox.current();
      unregisterBox.current = null;
    }
  });

  const boxPosition: Vec3 = [VETO_SPOT[0] + BOX_OFFSET[0], 0, VETO_SPOT[2] + BOX_OFFSET[2]];
  return (
    <group>
      <group ref={rex} position={VETO_SPOT} scale={0.02}>
        <group ref={body} scale={heightFt}>
          {dino ? <LowPolyDino /> : <GenericInflatable />}
        </group>
        {(stage === "inflating" || stage === "stamped") && (
          <Html center position={[0, heightFt + 0.7, 0]} zIndexRange={[30, 10]}>
            <div className={styles.wishChip}>
              {wishBy ? `${wishBy}'s wish: ` : ""}
              {item?.name ?? veto?.wish ?? "Vetoed wish"}
            </div>
          </Html>
        )}
      </group>
      {(stage === "stamped" || stage === "unstamping") && (
        <Html center position={[VETO_SPOT[0], heightFt * 0.55, VETO_SPOT[2]]} zIndexRange={[40, 20]}>
          <div className={`${styles.stamp} ${stage === "unstamping" ? styles.stampOut : ""}`}>
            <span className={styles.stampWord}>VETO</span>
            <span className={styles.stampRule}>{veto?.rule ?? (limitIn ? `Max height ${limitIn} in` : "House rule")}</span>
            {ruleBy && <span className={styles.stampBy}>{ruleBy}&apos;s house rule</span>}
          </div>
        </Html>
      )}
      <group ref={box} position={boxPosition} visible={false}>
        <OrnamentBox lid={lid} />
        {(stage === "unstamping" || stage === "resolving") && (
          <Html center position={[0, 1.5, 0]} zIndexRange={[30, 10]}>
            <div className={styles.resolution}>✓ {veto?.resolution ?? `Becomes the ${resolved?.name ?? "ornament set"}`}</div>
          </Html>
        )}
      </group>
    </group>
  );
}

/** The conflict beat: the vetoed wish inflates, gets stamped, then shrinks into its ornament box. */
export function VetoBeat() {
  const beat = useStage((state) => state.scene.conflictBeat);
  const [finished, setFinished] = useState<number | null>(null);
  const done = useMemo(() => beat !== null && finished === beat.startedAt, [beat, finished]);

  useEffect(() => {
    if (!beat || beat.resolveAt === null) return;
    const wait = beat.resolveAt + TIMING.boxExit + 700 - performance.now();
    const timer = window.setTimeout(() => setFinished(beat.startedAt), Math.max(0, wait));
    return () => window.clearTimeout(timer);
  }, [beat]);

  if (!beat || done) return null;
  return <VetoStage key={beat.startedAt} beat={beat} />;
}
