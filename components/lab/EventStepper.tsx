"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDemoTranscript } from "@/lib/demo/transcript";
import { orderedRoster } from "@/lib/people/roster";
import { emitGesture } from "@/lib/stage/bus";
import { MAX_SEATS } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import styles from "./EventStepper.module.css";

// Lab only: feeds the cached transcript into the council slice one event at a time so the visual
// tracks can check their reactions without the director.
export function EventStepper() {
  const events = useMemo(() => getDemoTranscript(), []);
  const nextIndex = useRef(0);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const phase = useStage((state) => state.phase);

  const step = useCallback(() => {
    const event = events[nextIndex.current];
    if (!event) {
      setPlaying(false);
      return;
    }
    useStage.getState().applyCouncilEvent(event);
    nextIndex.current += 1;
    setCursor(nextIndex.current);
  }, [events]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(step, 1500);
    return () => window.clearInterval(timer);
  }, [playing, step]);

  const seatAll = () =>
    orderedRoster()
      .slice(0, MAX_SEATS)
      .forEach((profile, seat) => useStage.getState().seatSprite(profile.id, seat));

  const reset = () => {
    nextIndex.current = 0;
    setCursor(0);
    setPlaying(false);
    // Through the bus so the director also clears its beat queue and aborts a running council.
    emitGesture({ type: "reset" });
  };

  const done = cursor >= events.length;
  return (
    <div className={styles.stepper}>
      <span>
        Lab · {cursor}/{events.length} · {phase}
      </span>
      <button type="button" onClick={seatAll}>
        Seat all
      </button>
      <button type="button" onClick={step} disabled={done}>
        Next event
      </button>
      <button type="button" onClick={() => setPlaying((value) => !value)} disabled={done}>
        {playing ? "Pause" : "Play"}
      </button>
      <button type="button" onClick={reset}>
        Reset
      </button>
    </div>
  );
}
