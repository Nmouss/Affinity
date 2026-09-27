"use client";

import { useLook } from "@/lib/people/roster";
import { BLANK_LOOK, STARTER_LOOKS } from "@/lib/people/starters";
import type { Supporter } from "./supporters";
import styles from "./SupporterRing.module.css";

const LEVEL_CLASS = {
  strong: styles.strong,
  neutral: styles.neutral,
  cool: styles.cool,
  unknown: styles.unknown,
} as const;

const LEVEL_WORD = {
  strong: "backs this pick",
  neutral: "is warm on it",
  cool: "isn't sold yet",
  unknown: "hasn't weighed in yet",
} as const;

/**
 * A small DOM portrait of one character (their roster look: body color, accent, face patch) inside a
 * ring whose color says how much they support the item. Hover/focus reveals their own words.
 */
export function SupporterRing({ supporter, name }: { supporter: Supporter; name: string }) {
  const look = useLook(supporter.id) ?? STARTER_LOOKS[supporter.id] ?? BLANK_LOOK;
  const score = supporter.score === null ? "" : ` · ${Math.round(supporter.score)}/10`;
  const detail = supporter.say ? ` “${supporter.say}”` : "";
  const label = `${name} ${LEVEL_WORD[supporter.level]}${score}.${detail}`;
  return (
    <li className={`${styles.ring} ${LEVEL_CLASS[supporter.level]}`} title={label} aria-label={label} tabIndex={0}>
      <span className={styles.body} style={{ background: look.bodyColor, borderColor: look.accent }} aria-hidden>
        <span className={styles.face} style={{ background: look.skin }}>
          <span className={styles.eye} style={{ background: look.eyes.color }} />
          <span className={styles.eye} style={{ background: look.eyes.color }} />
        </span>
      </span>
      {supporter.serves && <span className={styles.pickedFor} aria-hidden>★</span>}
      <span className={styles.name}>{name}</span>
    </li>
  );
}
