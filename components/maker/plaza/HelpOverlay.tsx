"use client";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- classic JSX runtime needs React in scope
import React, { type ReactNode } from "react";
import { MoveIcon, NewIcon } from "./plazaIcons";
import styles from "./HelpOverlay.module.css";

// A small "what does each icon do" card for the plaza, opened from the Help rail button. Purely
// explanatory — closing it never touches the maker flow or the roster.

const ENTRIES: Array<{ icon: ReactNode; title: string; body: string }> = [
  { icon: <span aria-hidden="true">◎</span>, title: "Mission circle", body: "Drag people into the center circle to include their personalities. Drag them back out to remove them." },
  { icon: <NewIcon size={32} />, title: "New person", body: "Make a new family member or friend." },
  { icon: <MoveIcon size={32} />, title: "Move", body: "Pick a Mii, then tap here to move them between Family and Friends." },
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Plaza help" onClick={onClose}>
      <div className={styles.card} onClick={(event) => event.stopPropagation()}>
        <h2 className={styles.heading}>Around the plaza</h2>
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
