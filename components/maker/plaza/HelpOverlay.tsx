"use client";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- classic JSX runtime needs React in scope
import React, { type ReactNode } from "react";
import { BackIcon, EditIcon, MoveIcon, NewIcon, RemoveIcon, WhistleIcon } from "./plazaIcons";
import styles from "./HelpOverlay.module.css";

// A small "what does each icon do" card for the plaza, opened from the Help rail button. Purely
// explanatory — closing it never touches the maker flow or the roster.

const ENTRIES: Array<{ icon: ReactNode; title: string; body: string }> = [
  { icon: <BackIcon size={32} />, title: "Done", body: "Back to the living room." },
  { icon: <EditIcon size={32} />, title: "View/Edit", body: "Pick a Mii, then tap here to change their look." },
  { icon: <NewIcon size={32} />, title: "New person", body: "Make a new family member or friend." },
  { icon: <RemoveIcon size={32} />, title: "Remove", body: "Pick a Mii, then tap here twice to remove them." },
  { icon: <MoveIcon size={32} />, title: "Move", body: "Pick a Mii, then tap here to move them between Family and Friends." },
  { icon: <WhistleIcon size={32} />, title: "Whistle", body: "Pick a way to line everyone up; tap again to let them wander." },
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
