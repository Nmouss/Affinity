"use client";

import { PRESET_KEYS, PRESET_LABELS, type MakerAction } from "./flow";
import type { CharacterLook } from "@/types/character";
import { LookPortrait } from "@/components/sprites/LookPortrait";
import { playBlip } from "./sound";
import { DiceIcon } from "@/components/hud/icons";
import styles from "./WhoPanel.module.css";
import startStyles from "./StartPanel.module.css";

export function StartPanel({ dispatch, look }: { dispatch: (action: MakerAction) => void; look?: CharacterLook }) {
  return (
    <div className={`${styles.card} ${startStyles.card}`}>
      {look && <LookPortrait look={look} />}
      <h2 className={styles.title}>Start from scratch, or a look-alike?</h2>
      <div className={startStyles.grid}>
        <button
          type="button"
          data-hand-target="start:scratch"
          className={startStyles.tile}
          onClick={() => {
            playBlip("select");
            dispatch({ type: "startScratch" });
          }}
        >
          Start from scratch
        </button>
        {PRESET_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            data-hand-target={`start:preset:${key}`}
            className={startStyles.tile}
            onClick={() => {
              playBlip("select");
              dispatch({ type: "startPreset", key });
            }}
          >
            {PRESET_LABELS[key]}
          </button>
        ))}
        <button
          type="button"
          data-hand-target="start:random"
          className={`${startStyles.tile} ${startStyles.random}`}
          onClick={() => {
            playBlip("select");
            dispatch({ type: "startRandom" });
          }}
        >
          <DiceIcon size={20} /> Random
        </button>
      </div>
      <button type="button" data-hand-target="who-back" className={styles.back} onClick={() => dispatch({ type: "back" })}>
        Back
      </button>
    </div>
  );
}
