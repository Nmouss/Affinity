import styles from "./Bundle.module.css";

export interface HappinessMeterProps {
  name: string;
  color: string;
  /** 0–10, or null while the sprite is still scoring. */
  score: number | null;
  say?: string;
  /** False once no more scores are coming, so a missing score stops shimmering. */
  pending?: boolean;
  plaza?: boolean;
}

export function HappinessMeter({ name, color, score, say, pending = true, plaza = false }: HappinessMeterProps) {
  const percent = score === null ? 0 : Math.max(0, Math.min(10, score)) * 10;
  let tone = styles.neutral;
  if (score === null && pending) tone = styles.pending;
  else if (score !== null && score >= 7) tone = styles.happy;
  else if (score !== null && score < 6) tone = styles.sad;
  return (
    <div className={`${styles.meter} ${plaza ? styles.plazaMeter : ""}`}>
      <div className={styles.meterHead}>
        <span className={styles.name}>
          <span className={styles.dot} style={{ background: color }} aria-hidden />
          {name}
        </span>
        <span className={styles.score}>{score === null ? (pending ? "…" : "–") : `${score}/10`}</span>
      </div>
      <div
        className={`${styles.track} ${tone}`}
        role="meter"
        aria-label={`${name} happiness`}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={score ?? 0}
      >
        <div className={styles.fill} style={{ width: `${percent}%`, background: color }} />
      </div>
      {say && <p className={styles.say}>“{say}”</p>}
    </div>
  );
}
