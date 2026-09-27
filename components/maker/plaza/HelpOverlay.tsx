"use client";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- classic JSX runtime needs React in scope
import React, { type ReactNode } from "react";
import { DinnerPlanIcon, InterviewIcon, MoveIcon, NewIcon, ShopTogetherIcon } from "./plazaIcons";
import styles from "./HelpOverlay.module.css";

// A small "what does each icon do" card for the plaza, opened from the Help rail button. Purely
// explanatory — closing it never touches the maker flow or the roster.

const ENTRIES: Array<{ icon: ReactNode; title: string; body: string }> = [
  { icon: <NewIcon size={32} />, title: "New person", body: "Make a new family member or friend, then teach them what you like." },
  { icon: <InterviewIcon size={32} />, title: "Interview", body: "Pick someone, then tap here to ask them a few questions again." },
  { icon: <MoveIcon size={32} />, title: "Move", body: "Pick someone, then tap here to move them between Family and Friends." },
  { icon: <ShopTogetherIcon size={32} />, title: "Shop for a gift", body: "Choose who the gift is for and who's buying. The council does the rest." },
  { icon: <DinnerPlanIcon size={32} />, title: "Make dinner plans", body: "Drag everyone who's coming into the circle, then start the plan." },
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Plaza help" onClick={onClose}>
      <div className={styles.card} onClick={(event) => event.stopPropagation()}>
        <h2 className={styles.heading}>Around the Plaza</h2>
        <ul className={styles.list}>
          {ENTRIES.map((entry) => (
            <li key={entry.title} className={styles.row}>
              <span className={styles.icon}>{entry.icon}</span>
              <span>
                <strong className={styles.rowTitle}>{entry.title}</strong>
                <span className={styles.rowBody}>{entry.body}</span>
              </span>
            </li>
          ))}
        </ul>
        <button type="button" data-hand-target="plaza-help-close" className={styles.close} onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
