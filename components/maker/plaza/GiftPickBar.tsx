"use client";

import { giftPickPrompt, type GiftPickState } from "./giftPick";
import styles from "./GiftPickBar.module.css";

export interface GiftPickBarProps {
  pick: GiftPickState;
  names: Record<string, string>;
  onNext: () => void;
  onBack: () => void;
  onLaunch: () => void;
}

/** The bottom bar while picking a gift's people: what to do now, who's picked, and the way forward. */
export function GiftPickBar({ pick, names, onNext, onBack, onLaunch }: GiftPickBarProps) {
  const { title, hint } = giftPickPrompt(pick, names);
  const onRecipientStep = pick.step === "recipient";
  return (
    <section className={styles.bar} aria-label="Pick who the gift is for and who's buying" aria-live="polite">
      <div className={styles.top}>
        <div className={styles.steps} aria-hidden>
          <span className={styles.dotOn} />
          <span className={onRecipientStep ? styles.dot : styles.dotOn} />
        </div>
        <div className={styles.picks}>
          {pick.recipientId && (
            <span className={styles.badgeRecipient}>
              <span className={styles.badgeRole}>Gift for</span>
              <span className={styles.badgeName}>{names[pick.recipientId] ?? pick.recipientId}</span>
            </span>
          )}
          {pick.buyerIds.map((id) => (
            <span key={id} className={styles.badgeBuyer}>
              <span className={styles.badgeRole}>Buying</span>
              <span className={styles.badgeName}>{names[id] ?? id}</span>
            </span>
          ))}
        </div>
      </div>
      <p className={styles.title}>{title}</p>
      <p className={styles.hint}>
        {hint} · <kbd>Esc</kbd> back
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.ghost} data-hand-target="gift-back" onClick={onBack}>
          {onRecipientStep ? "Cancel" : "Back"}
        </button>
        {onRecipientStep ? (
          <button type="button" className={styles.primary} data-hand-target="gift-next" disabled={!pick.recipientId} onClick={onNext}>
            Next: who's buying
          </button>
        ) : (
          <button type="button" className={styles.primary} data-hand-target="gift-launch" onClick={onLaunch}>
            Gather the council
          </button>
        )}
      </div>
    </section>
  );
}
