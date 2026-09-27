"use client";

import { getPerson } from "@/lib/people/roster";
import { MAX_SHOP_RECIPIENTS } from "@/lib/director/mission";
import styles from "./RecipientPicker.module.css";

export function RecipientPicker({
  candidateIds,
  selectedIds,
  onToggle,
  onConfirm,
  onCancel,
}: {
  candidateIds: string[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const selected = new Set(selectedIds);
  const atCap = selected.size >= MAX_SHOP_RECIPIENTS;
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Who is this for">
      <div className={styles.card}>
        <h2 className={styles.heading}>Who is this for?</h2>
        <p className={styles.copy}>
          Pick one person for a single gift, or several — we’ll shop one product each. Dinner plans still cover the whole circle.
        </p>
        <ul className={styles.list}>
          {candidateIds.map((id) => {
            const person = getPerson(id);
            const on = selected.has(id);
            const blocked = atCap && !on;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`${styles.choice} ${on ? styles.on : ""}`}
                  aria-pressed={on}
                  disabled={blocked}
                  onClick={() => onToggle(id)}
                >
                  {person?.name ?? id}
                </button>
              </li>
            );
          })}
        </ul>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={selected.size === 0} onClick={onConfirm}>
            Shop for {selected.size || "…"}
          </button>
          <button type="button" className={styles.secondary} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
