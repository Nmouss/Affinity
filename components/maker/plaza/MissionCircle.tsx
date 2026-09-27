"use client";

import { Html } from "@react-three/drei";
import { useStage } from "@/lib/stage/store";
import { MISSION_CIRCLE, usePlaza, usePlazaHtmlPortal } from "./plazaState";
import styles from "./MissionCircle.module.css";

/** The group-selection target: drag people inside and they remain gathered for the next mission. */
export function MissionCircle() {
  const dinnerOpen = usePlaza((state) => state.missionMode === "plan");
  const count = usePlaza((state) => state.missionMemberIds.length);
  const htmlPortal = usePlazaHtmlPortal();
  const councilOn = useStage((state) => state.phase !== "lobby");
  if (!dinnerOpen) return null;
  return (
    <group position={[MISSION_CIRCLE.x, 0, MISSION_CIRCLE.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .006, 0]}>
        <ringGeometry args={[MISSION_CIRCLE.radius - .12, MISSION_CIRCLE.radius, 80]} />
        <meshBasicMaterial color="#6b7349" transparent opacity={.78} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .004, 0]}>
        <circleGeometry args={[MISSION_CIRCLE.radius - .13, 80]} />
        <meshBasicMaterial color="#c5cbb0" transparent opacity={.18} depthWrite={false} />
      </mesh>
      {!councilOn && (
      <Html portal={htmlPortal} position={[0, .05, -MISSION_CIRCLE.radius + .35]} center pointerEvents="none" zIndexRange={[0, 0]}>
        <div className={styles.label}>
          <strong>Mission circle</strong>
          <span>{count === 0 ? "Drag people here" : `${count} ${count === 1 ? "person" : "people"} ready`}</span>
        </div>
      </Html>
      )}
    </group>
  );
}
