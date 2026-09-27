"use client";

import type { FamilyProfile, SpriteScore } from "@/types/domain";
import styles from "./ItemRanking.module.css";

export interface RankedItem {
  id: string;
  name: string;
  imageUrl?: string | null;
  forName?: string | null;
}

export interface ItemRankingProps {
  title: string;
  items: RankedItem[];
  agents: FamilyProfile[];
  scores: Record<string, SpriteScore>;
  pending?: boolean;
}

function shortName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Compact left-rail list of discussed items plus each agent's score for the proposal. */
export function ItemRanking({ title, items, agents, scores, pending = true }: ItemRankingProps) {
  if (items.length === 0) return null;
  return (
    <section className={styles.panel} aria-label={`${title} rankings`}>
      <h2 className={styles.title}>{title}</h2>
      <ol className={styles.items}>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" className={styles.thumb} />
            ) : (
              <span className={styles.thumbFallback} aria-hidden>
                {item.name.slice(0, 1)}
              </span>
            )}
            <span className={styles.copy}>
              <span className={styles.name}>{item.name}</span>
              {item.forName ? <span className={styles.for}>for {item.forName}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      <ul className={styles.ranks}>
        {agents.map((agent) => {
          const score = scores[agent.id]?.score;
          return (
            <li key={agent.id} className={styles.rank}>
              <span className={styles.dot} style={{ background: agent.colors[0] ?? "#6b7349" }} aria-hidden />
              <span className={styles.who}>{shortName(agent.name)}</span>
              <span className={styles.score}>{score == null ? (pending ? "…" : "–") : score}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
