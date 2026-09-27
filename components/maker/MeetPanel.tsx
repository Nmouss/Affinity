"use client";

import { useEffect } from "react";
import Link from "next/link";
import { PlazaButton, plazaButtonClassName } from "@/components/ui";
import buttonStyles from "@/components/ui/PlazaButton.module.css";
import { confidenceLabel, summarize, tasteLabels, STILL_LEARNING, type TasteProfile } from "@/lib/taste";
import type { MakerAction } from "./flow";
import { reactCelebrate } from "./reactions";
import { playBlip } from "./sound";
import styles from "./MeetPanel.module.css";

// Meet your character: a wave (reactCelebrate on mount), a few rounded taste labels, and a short,
// evidence-aware line about how sure the character is. Numbers stay out of it.

export interface MeetPanelProps {
  personName: string;
  profile: TasteProfile | undefined;
  dispatch: (action: MakerAction) => void;
}

/** "getting a feel for Ava's taste" — the confidence tier in a friendly sentence. */
export function confidenceSentence(name: string, profile: TasteProfile | undefined): string {
  const tier = profile ? confidenceLabel(profile) : "nothing learned yet";
  switch (tier) {
    case "nothing learned yet":
      return `${name} has not learned any taste yet. Teach a few pairs any time.`;
    case "just a hunch":
      return `${name} has just a hunch about your taste so far.`;
    case "getting a feel":
      return `${name} is getting a feel for your taste.`;
    case "pretty sure":
      return `${name} is pretty sure about your taste now.`;
  }
}

export function MeetPanel({ personName, profile, dispatch }: MeetPanelProps) {
  useEffect(() => {
    reactCelebrate();
    playBlip("save");
  }, []);

  const labels = profile ? tasteLabels(profile, 4) : [];
  const summary = profile ? summarize(profile) : STILL_LEARNING;

  return (
    <div className={styles.shell}>
      <section className={styles.card} aria-labelledby="meet-title">
        <h2 id="meet-title" className={styles.title}>
          Meet {personName}!
        </h2>
        <p className={styles.lead}>
          {summary === STILL_LEARNING ? `${personName} is ready to help pick gifts.` : `${personName} leans ${summary}.`}
        </p>
        {labels.length > 0 && (
          <ul className={styles.labels} aria-label="Taste">
            {labels.map((label) => (
              <li key={label} className={styles.label}>
                {label}
              </li>
            ))}
          </ul>
        )}
        <p className={styles.confidence}>{confidenceSentence(personName, profile)}</p>
        <div className={styles.actions}>
          <PlazaButton variant="secondary" size="lg" data-hand-target="meet:done" onClick={() => dispatch({ type: "meetDone" })}>
            Done
          </PlazaButton>
          <Link
            href="/"
            className={`${plazaButtonClassName(buttonStyles, { variant: "primary", size: "lg" })} ${styles.link}`}
            data-hand-target="meet:shop"
            onClick={() => playBlip("select")}
          >
            Go gift shopping
          </Link>
        </div>
      </section>
    </div>
  );
}
