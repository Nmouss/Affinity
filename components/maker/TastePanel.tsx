"use client";

import { useEffect, useState } from "react";
import { PlazaButton } from "@/components/ui";
import type { TasteChoice, TasteItem, TasteProfile } from "@/lib/taste";
import { currentComparison, tasteProgress, type MakerAction } from "./flow";
import { reactPick } from "./reactions";
import { playBlip } from "./sound";
import styles from "./TastePanel.module.css";

// Teach it what you like: one curated pair at a time, chosen by clicking a tile (or the arrow
// keys via useMakerKeyboard). The chosen tile pops and the character hops (reactPick) before the
// next pair slides in; the roster keeps the learned profile, this panel only reads it.

/** How long the picked tile stays highlighted before the next pair appears. */
export const CHOICE_HOLD_MS = 420;

export interface TastePanelProps {
  personName: string;
  profile: TasteProfile | undefined;
  dispatch: (action: MakerAction) => void;
}

function Tile({
  item,
  side,
  state,
  onPick,
}: {
  item: TasteItem;
  side: "left" | "right";
  state: "idle" | "chosen" | "dim";
  onPick: () => void;
}) {
  const className = [styles.tile, state === "chosen" && styles.tileChosen, state === "dim" && styles.tileDim].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      className={className}
      data-hand-target={`taste:${side}`}
      onClick={onPick}
      aria-label={`Choose ${item.name}`}
      aria-pressed={state === "chosen"}
    >
      {item.imageUrl ? (
        // Plain <img>: these are small local SVGs under /public/taste, no optimization pipeline needed.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.image} src={item.imageUrl} alt="" draggable={false} />
      ) : (
        <span className={styles.image} aria-hidden />
      )}
      <span className={styles.name}>{item.name}</span>
      <span className={styles.category}>{item.category}</span>
    </button>
  );
}

export function TastePanel({ personName, profile, dispatch }: TastePanelProps) {
  const comparison = currentComparison(profile);
  const { done, total } = tasteProgress(profile);
  // The pick being animated: which side, for which pair. Cleared when the next pair is dispatched.
  const [picked, setPicked] = useState<{ comparisonId: string; choice: TasteChoice } | null>(null);

  useEffect(() => {
    if (!picked) return;
    const timer = window.setTimeout(() => {
      dispatch({ type: "tasteChoice", choice: picked.choice });
      setPicked(null);
    }, CHOICE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [picked, dispatch]);

  // Every pair is done: hand over to "meet" (the reducer also does this on the last choice).
  useEffect(() => {
    if (!comparison && !picked) dispatch({ type: "tasteDone" });
  }, [comparison, picked, dispatch]);

  if (!comparison) return null;

  const choose = (choice: TasteChoice) => {
    if (picked) return;
    playBlip("select");
    if (choice === "left" || choice === "right") reactPick();
    setPicked({ comparisonId: comparison.id, choice });
  };

  const tileState = (side: "left" | "right"): "idle" | "chosen" | "dim" => {
    if (!picked || picked.comparisonId !== comparison.id) return "idle";
    if (picked.choice === side) return "chosen";
    return "dim";
  };

  return (
    <div className={styles.shell}>
      <section className={styles.card} aria-labelledby="taste-title" data-taste-panel>
        <h2 id="taste-title" className={styles.title}>
          Which would {personName} pick?
        </h2>
        <p className={styles.subtitle}>Click one. There are no wrong answers; skip anything you are not sure about.</p>

        <div className={styles.pair}>
          <Tile item={comparison.left} side="left" state={tileState("left")} onPick={() => choose("left")} />
          <span className={styles.or} aria-hidden>
            or
          </span>
          <Tile item={comparison.right} side="right" state={tileState("right")} onPick={() => choose("right")} />
        </div>

        <div className={styles.progress} aria-live="polite">
          <span>
            {Math.min(done + 1, total)} of {total}
          </span>
          <span className={styles.dots} aria-hidden>
            {Array.from({ length: total }, (_, index) => (
              <span key={index} className={index < done ? `${styles.dot} ${styles.dotDone}` : styles.dot} />
            ))}
          </span>
        </div>

        <div className={styles.controls}>
          <div className={styles.controlGroup}>
            <PlazaButton variant="secondary" data-hand-target="taste:neither" onClick={() => choose("neither")} disabled={picked !== null}>
              Neither<span className={styles.kbd}>N</span>
            </PlazaButton>
            <PlazaButton variant="ghost" data-hand-target="taste:skip" onClick={() => choose("skip")} disabled={picked !== null}>
              Skip<span className={styles.kbd}>S</span>
            </PlazaButton>
            <PlazaButton
              variant="ghost"
              data-hand-target="taste:undo"
              onClick={() => dispatch({ type: "tasteUndo" })}
              disabled={picked !== null || done === 0}
            >
              Undo<span className={styles.kbd}>U</span>
            </PlazaButton>
          </div>
          <PlazaButton variant="primary" data-hand-target="taste:done" onClick={() => dispatch({ type: "tasteDone" })}>
            {done === 0 ? "Skip for now" : "Done for now"}
            <span className={styles.kbd}>Enter</span>
          </PlazaButton>
        </div>
      </section>
    </div>
  );
}
