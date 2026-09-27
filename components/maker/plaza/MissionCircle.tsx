"use client";

import { Html } from "@react-three/drei";
import { MISSION_CIRCLE, usePlaza } from "./plazaState";
import styles from "./MissionCircle.module.css";

/** The group-selection target: drag people inside and they remain gathered for the next mission. */
export function MissionCircle() {
  const count = usePlaza((state) => state.missionMemberIds.length);
  return (
    <group position={[MISSION_CIRCLE.x, 0, MISSION_CIRCLE.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .006, 0]}>
        <ringGeometry args={[MISSION_CIRCLE.radius - .12, MISSION_CIRCLE.radius, 80]} />
        <meshBasicMaterial color="#ee9b32" transparent opacity={.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .004, 0]}>
        <circleGeometry args={[MISSION_CIRCLE.radius - .13, 80]} />
        <meshBasicMaterial color="#ffd88a" transparent opacity={.12} depthWrite={false} />
      </mesh>
      <Html position={[0, .05, -MISSION_CIRCLE.radius + .35]} center pointerEvents="none" zIndexRange={[0, 0]}>
        <div className={styles.label}>
          <strong>Mission circle</strong>
          <span>{count === 0 ? "Drag people here" : `${count} ${count === 1 ? "person" : "people"} ready`}</span>
        </div>
      </Html>
    </group>
  );
}
