"use client";

import type { InputSource } from "@/types/stage";
import { useStage } from "@/lib/stage/store";
import styles from "./GestureStatus.module.css";

export function gestureStatusLabel(source: InputSource, present: boolean): string {
  switch (source) {
    case "leap":
      return present ? "Leap · hands" : "Leap · no hands";
    case "replay":
      return "Replay";
    case "mediapipe":
      return present ? "Camera · hands" : "Camera · no hands";
    case "keyboard":
      return "Keyboard";
  }
}

/** HUD pip showing where input comes from. Props override the hand slice (for previews). */
export function GestureStatus({ source, present }: { source?: InputSource; present?: boolean }) {
  const storeSource = useStage((state) => state.hand.source);
  const storePresent = useStage((state) => state.hand.present);
  const activeSource = source ?? storeSource;
  const handsVisible = present ?? storePresent;
  const live = activeSource !== "keyboard" && handsVisible;

  return (
    <output className={styles.status} data-source={activeSource} data-live={live} aria-live="polite">
      <span className={styles.pip} aria-hidden="true" />
      {gestureStatusLabel(activeSource, handsVisible)}
    </output>
  );
}
