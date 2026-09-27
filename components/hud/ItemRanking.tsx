"use client";

import type { FamilyProfile, SpriteScore } from "@/types/domain";
import { ImageWithFallback } from "@/components/media/ImageWithFallback";
import { SupporterRow } from "./SupporterRow";
import { supportersForProposal } from "./supporters";
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

/** Compact left-rail list of the items on the table plus how warm each character is on them. */
export function ItemRanking({ title, items, agents, scores, pending = true }: ItemRankingProps) {
  if (items.length === 0) return null;
  return (
    <section className={styles.panel} aria-label={`${title} rankings`}>
      <h2 className={styles.title}>{title}</h2>
      <ol className={styles.items}>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            {item.imageUrl ? (
              <ImageWithFallback
                src={item.imageUrl}
                alt=""
                className={styles.thumb}
                fallback={<span className={styles.thumbFallback} aria-hidden>{item.name.slice(0, 1)}</span>}
              />
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
      <SupporterRow
        supporters={supportersForProposal(agents.map((agent) => agent.id), {}, scores)}
        nameOf={(id) => shortName(agents.find((agent) => agent.id === id)?.name ?? id)}
        sentence={!pending}
        ariaLabel="Who likes it so far"
      />
    </section>
  );
}
