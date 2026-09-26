"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { emitGesture } from "@/lib/stage/bus";
import { useStage } from "@/lib/stage/store";
import styles from "./MissionForm.module.css";

/** The mission (AP2 intent). Submitting convenes through the bus, so the same arming applies. */
export function MissionForm() {
  const missionText = useStage((state) => state.missionText);
  const setMissionText = useStage((state) => state.setMissionText);
  const seatedCount = useStage((state) => Object.values(state.sprites).filter((sprite) => sprite.seat !== null).length);
  const voiceStatus = useStage((state) => state.voiceStatus);
  const voiceAvailable = voiceStatus !== "unsupported";
  const listening = voiceStatus === "listening";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (emitGesture({ type: "convene" })) return;
    const { setError } = useStage.getState();
    setError(missionText.trim() ? "Seat at least one sprite in the council ring first." : "Tell the council what to find.");
  };

  // Speaking replaces typing; a click on the mic toggles the same push-to-talk the palm-up hold (or V) does.
  const toggleTalk = () => emitGesture(listening ? { type: "talkEnd" } : { type: "talkStart" });

  // Typing "r" or "d" here must not reset the stage or toggle reasoning via window key handlers.
  const keepKeysLocal = (event: KeyboardEvent) => {
    if (event.key !== "Escape") event.stopPropagation();
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.label} htmlFor="mission">
        What should the council find?
      </label>
      <div className={styles.row}>
        <input
          id="mission"
          name="mission"
          className={styles.input}
          value={missionText}
          onChange={(event) => setMissionText(event.target.value)}
          onKeyDown={keepKeysLocal}
          onKeyUp={keepKeysLocal}
          autoComplete="off"
          spellCheck={false}
        />
        {voiceAvailable && (
          <button
            type="button"
            className={listening ? styles.micListening : styles.mic}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Speak the mission"}
            onClick={toggleTalk}
          >
            <span className={styles.micDot} aria-hidden />
            {listening ? "Listening…" : "Speak"}
          </button>
        )}
        <button type="submit" className={styles.submit}>
          Gather the council
        </button>
      </div>
      <p className={styles.hint}>
        {seatedCount === 0
          ? "Pinch-drag sprites into the ring (or press 1 · 2 · 3), then pinch the hearth."
          : `${seatedCount} seated. Pinch the hearth or press Enter to convene.`}
        {voiceAvailable && " Hold your palm up to speak (or hold V)."}
      </p>
    </form>
  );
}
