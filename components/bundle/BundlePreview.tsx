import type { Bundle, FamilyProfile } from "@/types/domain";
import { handItem, handTarget } from "@/components/hands/makerHitTest";
import { ImageWithFallback } from "@/components/media/ImageWithFallback";
import styles from "./Bundle.module.css";

const money = (value: number) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`;

export interface BundlePreviewProps {
  bundle: Bundle;
  budget: number;
  family: FamilyProfile[];
  /** Asks the council for a different item in this slot. Omit to hide the swap action. */
  onSwap?: (itemId: string) => void;
  /** Item id currently awaiting a swapped replacement, for a loading state. */
  swapping?: string | null;
}

/** The proposed cart as a budget bar (total vs budget), who each item serves, and per-item actions. */
export function BundlePreview({ bundle, budget, family, onSwap, swapping }: BundlePreviewProps) {
  const ratio = budget > 0 ? bundle.total / budget : 1;
  const over = bundle.total > budget;
  const servedBy = (itemId: string) =>
    Object.entries(bundle.serves)
      .filter(([, items]) => items.includes(itemId))
      .map(([id]) => family.find((member) => member.id === id))
      .filter((member): member is FamilyProfile => Boolean(member));

  return (
    <section className={styles.bundle} aria-label="Proposed bundle">
      <div className={styles.budgetHead}>
        <span className={styles.total}>{money(bundle.total)}</span>
        <span className={styles.budget}>/ {money(budget)}</span>
        <span className={over ? styles.over : styles.under}>
          {over ? `${money(bundle.total - budget)} over` : `${money(budget - bundle.total)} left`}
        </span>
      </div>
      <div className={styles.budgetTrack} role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={bundle.total}>
        <div className={over ? styles.budgetFillOver : styles.budgetFill} style={{ width: `${Math.min(1, ratio) * 100}%` }} />
      </div>
      <ul className={styles.items}>
        {bundle.items.map((item) => (
          <li key={item.id} className={styles.item} {...handItem(item.id)}>
            {item.imageUrl ? (
              <ImageWithFallback
                src={item.imageUrl}
                alt=""
                className={styles.itemImage}
                loading="lazy"
                fallback={<span className={styles.itemImagePlaceholder} aria-hidden>{item.name.slice(0, 1)}</span>}
              />
            ) : (
              <span className={styles.itemImagePlaceholder} aria-hidden>{item.name.slice(0, 1)}</span>
            )}
            <span className={styles.itemName}>{item.name}</span>
            <span className={styles.servedBy}>
              {servedBy(item.id).map((member) => (
                <span
                  key={member.id}
                  className={styles.dot}
                  style={{ background: member.colors[0] }}
                  title={member.name}
                  aria-label={member.name}
                />
              ))}
            </span>
            <span className={styles.price}>{money(item.price)}</span>
            <span className={styles.itemActions}>
              {onSwap && (
                <button
                  type="button"
                  {...handTarget(`bundle-swap:${item.id}`)}
                  className={styles.swap}
                  onClick={() => onSwap(item.id)}
                  disabled={swapping === item.id}
                >
                  {swapping === item.id ? "Asking…" : "Swap"}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
