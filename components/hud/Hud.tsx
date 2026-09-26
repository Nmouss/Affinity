"use client";

import { MissionForm } from "@/components/council/MissionForm";
import { useStage } from "@/lib/stage/store";
import styles from "./Hud.module.css";

// Placeholder owned by the director track: DOM overlay for the mission form, constraint board,
// meters, reasoning panel, and receipt. Director hooks mount here too.
export function Hud() {
  const phase = useStage((state) => state.phase);

  return (
    <div className={styles.hud}>
      <header className={styles.top}>
        <strong>Affinity</strong>
        <span className={styles.phase}>{phase}</span>
      </header>
      {phase === "lobby" && (
        <div className={styles.mission}>
          <MissionForm />
        </div>
      )}
    </div>
  );
}
