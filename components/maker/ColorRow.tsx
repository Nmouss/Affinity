"use client";

import styles from "./ColorRow.module.css";

// A row of color swatches (FAVORITE_COLORS / SKIN_TONES / EYE_COLORS), used across the Colors,
// Eyes, Cheeks, and Accessory tabs. Each swatch is a real button so it works with mouse, keyboard,
// and MakerHands alike.

export interface ColorRowProps {
  colors: readonly string[];
  selected: string;
  onSelect: (color: string) => void;
  handTargetPrefix: string;
  "aria-label": string;
}

export function ColorRow({ colors, selected, onSelect, handTargetPrefix, ...aria }: ColorRowProps) {
  return (
    <div className={styles.row} role="group" aria-label={aria["aria-label"]}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          data-hand-target={`${handTargetPrefix}:${color}`}
          className={color === selected ? `${styles.swatch} ${styles.selected}` : styles.swatch}
          style={{ background: color }}
          aria-pressed={color === selected}
          aria-label={color}
          onClick={() => onSelect(color)}
        />
      ))}
    </div>
  );
}
