"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type Group, type InstancedMesh, type MeshBasicMaterial } from "three";
import { usePeople } from "@/lib/people/roster";
import { RULER } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import { effectiveHardRules, heightRuleAuthor, inchesToFeet, maxHeightInches } from "./catalog";
import { TIMING, easeOutCubic, progress } from "./timing";
import styles from "./labels.module.css";

const MAX_FT = 8;
const BOARD = { width: 0.8, height: MAX_FT + 0.4 } as const;
const BAND_COLORS = ["#ff8f8f", "#ffb86b", "#ffe26b", "#9fe07a", "#6bd3c9", "#7fb2ff", "#b99cff", "#ff9fd2"];
/** The rule line spans the tree corner, from the ruler to just short of the hearth. */
const LINE = { from: RULER.position[0] - 0.9, to: -2.8 } as const;
const LIMIT_DEPTH = 3.4;
const LINE_RED = new Color("#ff3030").multiplyScalar(3);

function Ticks() {
  const mesh = useRef<InstancedMesh>(null);
  const ticks = useMemo(() => Array.from({ length: MAX_FT * 2 + 1 }, (_, i) => i * 0.5), []);
  useLayoutEffect(() => {
    const dummy = new Object3D();
    ticks.forEach((ft, index) => {
      const major = Number.isInteger(ft);
      dummy.position.set(major ? -0.12 : -0.21, ft, 0.04);
      dummy.scale.set(major ? 0.42 : 0.24, 1, 1);
      dummy.updateMatrix();
      mesh.current?.setMatrixAt(index, dummy.matrix);
    });
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  }, [ticks]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, ticks.length]}>
      <boxGeometry args={[1, 0.035, 0.02]} />
      <meshStandardMaterial color="#4a3526" />
    </instancedMesh>
  );
}

/** Glowing red line at the strictest maxHeight rule, on the wall and as a faint ceiling over the corner. */
function RuleLine({ inches, author }: { inches: number; author: string | null }) {
  const [shownAt] = useState(() => performance.now());
  const sweep = useRef<Group>(null);
  const wallMaterial = useRef<MeshBasicMaterial>(null);
  const planeMaterial = useRef<MeshBasicMaterial>(null);
  const y = inchesToFeet(inches);
  const width = LINE.to - LINE.from;

  useFrame(({ clock }) => {
    const now = performance.now();
    sweep.current?.scale.set(Math.max(0.001, easeOutCubic(progress(now, shownAt, 700))), 1, 1);
    // Pulse on arrival and again when the VETO stamp lands.
    const beat = useStage.getState().scene.conflictBeat;
    const sinceStamp = beat ? now - (beat.startedAt + TIMING.vetoStamp) : -1;
    const stampPulse = sinceStamp >= 0 && sinceStamp < 1500 ? 1 - sinceStamp / 1500 : 0;
    const arrival = 1 - progress(now, shownAt, 2000);
    const glow = 1 + 0.25 * Math.sin(clock.elapsedTime * 3) + arrival * 0.8 + stampPulse * 1.5;
    wallMaterial.current?.color.copy(LINE_RED).multiplyScalar(glow);
    if (planeMaterial.current) planeMaterial.current.opacity = 0.07 + stampPulse * 0.12 + arrival * 0.08;
  });

  return (
    <group>
      <group ref={sweep} position={[LINE.from, y, RULER.position[2] + 0.06]}>
        <mesh position-x={width / 2}>
          <boxGeometry args={[width, 0.08, 0.03]} />
          <meshBasicMaterial ref={wallMaterial} toneMapped={false} />
        </mesh>
        <mesh position={[width / 2, 0, LIMIT_DEPTH / 2]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[width, LIMIT_DEPTH]} />
          <meshBasicMaterial ref={planeMaterial} color="#ff4040" transparent opacity={0.1} depthWrite={false} side={2} />
        </mesh>
      </group>
      <Html center position={[RULER.position[0] + 2.6, y + 0.3, RULER.position[2] + 0.1]} zIndexRange={[25, 5]}>
        <div className={styles.ruleChip}>
          Max {inches} in
          {author && <small>{author}&apos;s rule</small>}
        </div>
      </Html>
    </group>
  );
}

/** Growth-chart ruler on the back wall (0–8 ft), plus the house rule's height line. */
export function HeightRuler() {
  const people = usePeople();
  const constraints = useStage((state) => state.constraints);
  const opinions = useStage((state) => state.opinions);
  const conflict = useStage((state) => state.conflict);
  const inches = useMemo(() => maxHeightInches(effectiveHardRules(constraints, opinions)), [constraints, opinions]);
  const authorId = conflict?.ruleBy ?? heightRuleAuthor(opinions, inches);
  const author = people.find((profile) => profile.id === authorId)?.name ?? null;
  const [x, , z] = RULER.position;

  return (
    <group>
      <group position={[x, 0, z]}>
        <mesh position={[0, BOARD.height / 2, 0]}>
          <boxGeometry args={[BOARD.width, BOARD.height, 0.06]} />
          <meshStandardMaterial color="#fbf3e2" roughness={0.8} />
        </mesh>
        {BAND_COLORS.map((color, index) => (
          <mesh key={color} position={[BOARD.width / 2 - 0.12, index + 0.5, 0.035]}>
            <boxGeometry args={[0.2, 1, 0.01]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
        ))}
        <Ticks />
        {Array.from({ length: MAX_FT + 1 }, (_, ft) => (
          <Html key={ft} center position={[-BOARD.width / 2 - 0.32, ft === 0 ? 0.3 : ft, 0.05]} distanceFactor={14} zIndexRange={[5, 0]}>
            <div className={styles.rulerLabel}>{ft} ft</div>
          </Html>
        ))}
      </group>
      {inches !== null && <RuleLine key={inches} inches={inches} author={author} />}
    </group>
  );
}
