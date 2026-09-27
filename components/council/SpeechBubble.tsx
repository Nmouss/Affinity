"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { clampBubble, typedLength } from "@/components/sprites/typewriter";
import styles from "./SpeechBubble.module.css";

export interface SpeechBubbleProps {
  speaker: string;
  /** Full line; typed out at ~30 chars/s. */
  text: string | null;
  /** Shows animated "…" instead of text. */
  thinking?: boolean;
  accent?: string;
  /** Which way the bubble grows from the tail. */
  align?: "left" | "center" | "right";
  /** Current speaker — full contrast. Off = a leftover line that should recede. */
  active?: boolean;
}

// DOM bubble rendered inside drei <Html>. The typewriter writes textContent from rAF, so typing
// never re-renders React.
export function SpeechBubble({
  speaker,
  text,
  thinking = false,
  accent,
  align = "center",
  active = true,
}: SpeechBubbleProps) {
  const typed = useRef<HTMLSpanElement>(null);
  const rest = useRef<HTMLSpanElement>(null);
  const line = text ? clampBubble(text) : "";

  // Layout effect so the first frame already has the full line reserved (no resize flash).
  useLayoutEffect(() => {
    if (thinking || !line) return;
    const start = performance.now();
    let frame = 0;
    const tick = () => {
      const count = typedLength(line, (performance.now() - start) / 1000);
      if (typed.current) typed.current.textContent = line.slice(0, count);
      if (rest.current) rest.current.textContent = line.slice(count);
      if (count < line.length) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [line, thinking]);

  if (!thinking && !line) return null;

  return (
    <div className={`${styles.anchor} ${align === "center" ? "" : styles[align]}`}>
      <div
        key={thinking ? "thinking" : line}
        className={styles.bubble}
        style={{ "--accent": accent } as CSSProperties}
        role="status"
        aria-label={thinking ? `${speaker} is thinking` : `${speaker}: ${line}`}
      >
        <span className={styles.speaker}>{speaker}</span>
        {thinking ? (
          <span className={styles.dots} aria-hidden>
            <span />
            <span />
            <span />
          </span>
        ) : (
          <span aria-hidden>
            <span ref={typed} />
            <span ref={rest} className={styles.rest} />
          </span>
        )}
      </div>
    </div>
  );
}
