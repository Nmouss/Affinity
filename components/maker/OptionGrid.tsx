"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import styles from "./OptionGrid.module.css";

// A big-tile, hand-friendly grid of pick-one options (Eyes/Brows/Mouth/Accessory type grids, the
// preset picks, etc). Real <button>s so mouse, keyboard, and MakerHands (which just clicks the DOM
// element under the pointer) all work the same way. Roving tabindex: only the selected tile (or the
// first) sits in the Tab order, so Tab moves between groups while the arrow keys move within one,
// per the People Maker's keyboard map.

export interface GridOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export interface OptionGridProps<T extends string> {
  options: readonly GridOption<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
  /** Suffix appended to each tile's data-hand-target, e.g. "eyes" -> "eyes:dot". */
  handTargetPrefix: string;
  "aria-label": string;
}

export function OptionGrid<T extends string>({
  options,
  selected,
  onSelect,
  handTargetPrefix,
  ...aria
}: OptionGridProps<T>) {
  const root = useRef<HTMLDivElement>(null);

  function focusIndex(index: number) {
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>("button[data-option]");
    if (!buttons || buttons.length === 0) return;
    const clamped = (index + buttons.length) % buttons.length;
    buttons[clamped]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>("button[data-option]");
    if (!buttons || buttons.length === 0) return;
    const current = Array.from(buttons).indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusIndex(current + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusIndex(current - 1);
    }
  }

  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selected));

  return (
    <div ref={root} className={styles.grid} role="group" aria-label={aria["aria-label"]} onKeyDown={onKeyDown}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          data-option
          data-hand-target={`${handTargetPrefix}:${option.value}`}
          tabIndex={index === selectedIndex ? 0 : -1}
          className={option.value === selected ? `${styles.tile} ${styles.selected}` : styles.tile}
          aria-pressed={option.value === selected}
          onClick={() => onSelect(option.value)}
        >
          <span className={styles.thumb}>{option.icon}</span>
          <span className={styles.label}>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
