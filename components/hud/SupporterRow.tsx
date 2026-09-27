"use client";

import { SupporterRing } from "./SupporterRing";
import { supportSentence, type Supporter } from "./supporters";
import styles from "./SupporterRow.module.css";

export interface SupporterRowProps {
  supporters: readonly Supporter[];
  nameOf: (id: string) => string;
  /** Show the one-line summary under the circles. */
  sentence?: boolean;
  size?: "md" | "lg";
  ariaLabel?: string;
}

/** Who backs a pick, at a glance: one progress-ring portrait per council member and a plain sentence. */
export function SupporterRow({ supporters, nameOf, sentence = true, size = "md", ariaLabel = "Who supports this" }: SupporterRowProps) {
  if (supporters.length === 0) return null;
  return (
    <section className={styles.wrap} aria-label={ariaLabel}>
      <ul className={styles.row}>
        {supporters.map((supporter) => (
          <SupporterRing key={supporter.id} supporter={supporter} name={nameOf(supporter.id)} size={size} />
        ))}
      </ul>
      {sentence && <p className={styles.line}>{supportSentence(supporters, nameOf)}</p>}
    </section>
  );
}
