"use client";

import styles from "./Stepper.module.css";

// A labeled pair of big +/- (or arrow) buttons: Body height/build, and the Eyes/Brows adjust pads.

export interface StepperProps {
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
  handTargetPrefix: string;
}

export function Stepper({ label, decreaseLabel, increaseLabel, onDecrease, onIncrease, handTargetPrefix }: StepperProps) {
  return (
    <div className={styles.stepper}>
      <span className={styles.label}>{label}</span>
      <div className={styles.buttons}>
        <button type="button" data-hand-target={`${handTargetPrefix}:down`} className={styles.button} onClick={onDecrease} aria-label={`${label}: ${decreaseLabel}`}>
          {decreaseLabel}
        </button>
        <button type="button" data-hand-target={`${handTargetPrefix}:up`} className={styles.button} onClick={onIncrease} aria-label={`${label}: ${increaseLabel}`}>
          {increaseLabel}
        </button>
      </div>
    </div>
  );
}
