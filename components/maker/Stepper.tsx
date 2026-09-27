"use client";

import type React from "react";

import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, MinusIcon, PlusIcon } from "@/components/hud/icons";
import styles from "./Stepper.module.css";

/** The tabs pass a direction glyph; buttons show a stroke icon and speak a word for it. */
const GLYPHS: Record<string, { icon: React.ReactNode; word: string }> = {
  "↓": { icon: <ArrowDownIcon size={20} />, word: "down" },
  "↑": { icon: <ArrowUpIcon size={20} />, word: "up" },
  "←": { icon: <ArrowLeftIcon size={20} />, word: "left" },
  "→": { icon: <ArrowRightIcon size={20} />, word: "right" },
  "−": { icon: <MinusIcon size={20} />, word: "less" },
  "-": { icon: <MinusIcon size={20} />, word: "less" },
  "+": { icon: <PlusIcon size={20} />, word: "more" },
};

function glyph(label: string): { icon: React.ReactNode; word: string } {
  return GLYPHS[label] ?? { icon: label, word: label };
}

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
        <button type="button" data-hand-target={`${handTargetPrefix}:down`} className={styles.button} onClick={onDecrease} aria-label={`${label}: ${glyph(decreaseLabel).word}`}>
          {glyph(decreaseLabel).icon}
        </button>
        <button type="button" data-hand-target={`${handTargetPrefix}:up`} className={styles.button} onClick={onIncrease} aria-label={`${label}: ${glyph(increaseLabel).word}`}>
          {glyph(increaseLabel).icon}
        </button>
      </div>
    </div>
  );
}
