"use client";

import { BODY_SIZES, CIRCLES, type BodySize, type CharacterLook, type Circle } from "@/types/character";
import { LookPortrait } from "@/components/sprites/LookPortrait";
import { SIZE_RELATIONSHIP, type MakerAction } from "./flow";
import { playBlip } from "./sound";
import styles from "./WhoPanel.module.css";

const CIRCLE_LABEL: Record<Circle, string> = { family: "Family", friend: "Friend" };
const SIZE_LABEL: Record<BodySize, string> = { grownup: "Grown-up", kid: "Kid", little: "Little one" };

export function WhoCirclePanel({ dispatch, look }: { dispatch: (action: MakerAction) => void; look?: CharacterLook }) {
  return (
    <div className={styles.card}>
      {look && <LookPortrait look={look} size="lg" />}
      <h2 className={styles.title}>Who is this?</h2>
      <p className={styles.subtitle}>Family or friend?</p>
      <div className={styles.choices}>
        {CIRCLES.map((circle) => (
          <button
            key={circle}
            type="button"
            data-hand-target={`who-circle:${circle}`}
            className={styles.choice}
            onClick={() => {
              playBlip("select");
              dispatch({ type: "pickCircle", circle });
            }}
          >
            <span className={circle === "family" ? styles.chipFamily : styles.chipFriend} aria-hidden>
              {CIRCLE_LABEL[circle]}
            </span>
            {CIRCLE_LABEL[circle]}
            <span className={styles.hint}>{circle === "family" ? "Lives in the living room" : "Visits when invited"}</span>
          </button>
        ))}
      </div>
      <button type="button" data-hand-target="who-back" className={styles.back} onClick={() => dispatch({ type: "back" })}>
        Back
      </button>
    </div>
  );
}

export function WhoSizePanel({ dispatch }: { dispatch: (action: MakerAction) => void }) {
  return (
    <div className={styles.card}>
      <h2 className={styles.title}>Who is this?</h2>
      <p className={styles.subtitle}>Grown-up, kid, or little one?</p>
      <div className={styles.choices}>
        {BODY_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            data-hand-target={`who-size:${size}`}
            className={styles.choice}
            onClick={() => {
              playBlip("select");
              dispatch({ type: "pickSize", size });
            }}
          >
            {SIZE_LABEL[size]}
            <span className={styles.hint}>{SIZE_RELATIONSHIP[size]}</span>
          </button>
        ))}
      </div>
      <button type="button" data-hand-target="who-back" className={styles.back} onClick={() => dispatch({ type: "back" })}>
        Back
      </button>
    </div>
  );
}
