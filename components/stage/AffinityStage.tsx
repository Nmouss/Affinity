"use client";

import dynamic from "next/dynamic";
import { InputRoot } from "@/components/hands/InputRoot";
import { Hud } from "@/components/hud/Hud";
import { EventStepper } from "@/components/lab/EventStepper";
import styles from "./AffinityStage.module.css";

// WebGL, leva, and the Leap socket are browser-only, so the canvas never renders on the server.
const StageCanvas = dynamic(() => import("./StageCanvas"), { ssr: false });

export function AffinityStage({ lab = false }: { lab?: boolean }) {
  return (
    <section className={styles.stage} aria-label="Affinity family council stage">
      <div className={styles.canvas}>
        <StageCanvas lab={lab} />
      </div>
      <Hud />
      <InputRoot />
      {lab && <EventStepper />}
    </section>
  );
}
