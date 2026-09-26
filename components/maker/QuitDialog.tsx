"use client";

import { playBlip } from "./sound";
import type { MakerAction } from "./flow";
import styles from "./QuitDialog.module.css";

// Exact Mii Channel wording: Save and Quit / Quit without Saving / Cancel.

export function QuitDialog({ dispatch }: { dispatch: (action: MakerAction) => void }) {
  return (
    <div className={styles.overlay} role="alertdialog" aria-modal="true" aria-label="Quit without saving?">
      <div className={styles.dialog}>
        <p className={styles.message}>Save changes to this person?</p>
        <div className={styles.actions}>
          <button
            type="button"
            data-hand-target="quit-save"
            className={`${styles.button} ${styles.primary}`}
            onClick={() => {
              playBlip("save");
              dispatch({ type: "save" });
            }}
          >
            Save and Quit
          </button>
          <button
            type="button"
            data-hand-target="quit-discard"
            className={styles.button}
            onClick={() => {
              playBlip("select");
              dispatch({ type: "quitWithoutSaving" });
            }}
          >
            Quit without Saving
          </button>
          <button
            type="button"
            data-hand-target="quit-cancel"
            className={styles.button}
            onClick={() => {
              playBlip("select");
              dispatch({ type: "cancelDialog" });
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
