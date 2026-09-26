"use client";

import { FAMILY } from "@/lib/stage/slices/council";
import { useStage } from "@/lib/stage/store";
import styles from "./ReasoningPanel.module.css";

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** "Show reasoning" (D): each sprite's raw structured output, the deterministic merge, and the scores. */
export function ReasoningPanel() {
  const opinions = useStage((state) => state.opinions);
  const constraints = useStage((state) => state.constraints);
  const conflict = useStage((state) => state.conflict);
  const scores = useStage((state) => state.scores);
  const focusId = useStage((state) => state.reasoningFocusId);
  const mission = useStage((state) => state.mission);

  const name = (id: string) => FAMILY.find((profile) => profile.id === id)?.name ?? id;
  const opinionEntries = Object.values(opinions);
  const scoreEntries = Object.values(scores);
  const empty = opinionEntries.length === 0 && !constraints && scoreEntries.length === 0;

  return (
    <aside className={styles.panel} aria-label="Council reasoning">
      <h2 className={styles.title}>
        Show reasoning <span className={styles.kbd}>D</span>
      </h2>
      {empty && <p className={styles.empty}>Convene the council to see each sprite&apos;s structured output.</p>}
      {mission && (
        <details className={styles.block}>
          <summary>Mission (intent)</summary>
          <pre className={styles.pre}>{json(mission)}</pre>
        </details>
      )}
      {opinionEntries.map((opinion) => (
        <details
          key={opinion.spriteId}
          className={opinion.spriteId === focusId ? styles.focused : styles.block}
          open={focusId === null || opinion.spriteId === focusId}
        >
          <summary>{name(opinion.spriteId)} · sprite_opinion</summary>
          <pre className={styles.pre}>{json(opinion)}</pre>
        </details>
      ))}
      {constraints && (
        <details className={styles.block} open>
          <summary>merge · deterministic</summary>
          <pre className={styles.pre}>{json(constraints)}</pre>
        </details>
      )}
      {conflict && (
        <details className={styles.block}>
          <summary>veto attribution</summary>
          <pre className={styles.pre}>{json(conflict)}</pre>
        </details>
      )}
      {scoreEntries.length > 0 && (
        <details className={styles.block} open>
          <summary>sprite_score</summary>
          <pre className={styles.pre}>{json(scoreEntries)}</pre>
        </details>
      )}
    </aside>
  );
}
