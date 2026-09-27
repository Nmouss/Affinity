"use client";

import { useLook } from "@/lib/people/roster";
import { BLANK_LOOK, STARTER_LOOKS } from "@/lib/people/starters";
import type { Supporter } from "./supporters";
import { StarIcon } from "./icons";
import styles from "./SupporterRing.module.css";

const LEVEL_CLASS = {
  strong: styles.strong,
  neutral: styles.neutral,
  cool: styles.cool,
  unknown: styles.unknown,
} as const;

const LEVEL_WORD = {
  strong: "backs this",
  neutral: "is warm on it",
  cool: "isn't sold yet",
  unknown: "hasn't weighed in yet",
} as const;

/**
 * A small DOM portrait of one character (their roster look: body color, accent, face patch) inside a
 * progress ring: the arc is their score out of ten and its color how much they back the pick.
 * Hover/focus reveals their own words.
 */
export function SupporterRing({ supporter, name, size = "md" }: { supporter: Supporter; name: string; size?: "md" | "lg" }) {
  const look = useLook(supporter.id) ?? STARTER_LOOKS[supporter.id] ?? BLANK_LOOK;
  const scored = supporter.score !== null;
  const score = scored ? ` · ${Math.round(supporter.score!)}/10` : "";
  const detail = supporter.say ? ` “${supporter.say}”` : "";
  const label = `${name} ${LEVEL_WORD[supporter.level]}${score}.${detail}`;
  const fill = scored ? Math.max(0.04, Math.min(1, supporter.score! / 10)) : 0;
  return (
    <li
      className={`${styles.ring} ${LEVEL_CLASS[supporter.level]} ${size === "lg" ? styles.large : ""}`}
      style={{ ["--fill" as string]: fill }}
      title={label}
      aria-label={label}
      tabIndex={0}
    >
      <span className={styles.arc} aria-hidden>
        <span className={styles.body} style={{ background: look.bodyColor, borderColor: look.accent }}>
          <span className={styles.face} style={{ background: look.skin }}>
            <span className={styles.eye} style={{ background: look.eyes.color }} />
            <span className={styles.eye} style={{ background: look.eyes.color }} />
          </span>
        </span>
      </span>
      {supporter.serves && (
        <span className={styles.pickedFor} aria-hidden>
          <StarIcon size={11} />
        </span>
      )}
      {scored && (
        <span className={styles.score} aria-hidden>
          {Math.round(supporter.score!)}
        </span>
      )}
      <span className={styles.name}>{name}</span>
    </li>
  );
}
