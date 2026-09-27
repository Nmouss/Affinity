"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./WelcomeScreen.module.css";

// The Affinity family greeting shown before the Plaza (ported from the Codex "hearth-characters"
// welcome). Theo leans in with a high-five palm; clicking the palm, the Enter button, or a confirmed
// gesture from a future Leap adapter fades the artwork and hands over to the Plaza. Presentation only:
// the input event is never consent for anything.

/** Presentation-only input from a future local Leap adapter, not an authorization signal. */
export type WelcomeInput =
  | { type: "tracking"; connected: boolean; handPresent: boolean }
  | { type: "gesture"; gesture: "wave" | "high-five"; confirmed: true };

export const WELCOME_INPUT_EVENT = "affinity:welcome-input";

const ART = "/brand/welcome/";
const ENTER_DELAY_MS = 420;
/** Tracking older than this no longer vouches for a gesture. */
const TRACKING_FRESH_MS = 2000;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function WelcomeScreen({ onEnter }: { onEnter: () => void }) {
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tracking, setTracking] = useState<"offline" | "searching" | "ready">("offline");
  const [entering, setEntering] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    setReduced(prefersReducedMotion());
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => {
      query.removeEventListener("change", change);
      clearTimeout(timer.current);
    };
  }, []);

  const enter = useCallback(() => {
    if (locked.current) return;
    locked.current = true;
    setEntering(true);
    timer.current = setTimeout(onEnter, reduced ? 0 : ENTER_DELAY_MS);
  }, [onEnter, reduced]);

  useEffect(() => {
    let lastTracking = -Infinity;
    let handReady = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const receive = (event: Event) => {
      const data: unknown = (event as CustomEvent).detail;
      if (!data || typeof data !== "object") return;
      const input = data as Partial<WelcomeInput>;
      if (input.type === "tracking" && typeof input.connected === "boolean" && typeof input.handPresent === "boolean") {
        lastTracking = performance.now();
        handReady = input.connected && input.handPresent;
        setTracking(!input.connected ? "offline" : handReady ? "ready" : "searching");
        clearTimeout(expiry);
        expiry = setTimeout(() => {
          handReady = false;
          setTracking("offline");
        }, TRACKING_FRESH_MS);
      } else if (
        input.type === "gesture" &&
        input.confirmed === true &&
        (input.gesture === "wave" || input.gesture === "high-five") &&
        handReady &&
        performance.now() - lastTracking < TRACKING_FRESH_MS
      ) {
        enter();
      }
    };
    window.addEventListener(WELCOME_INPUT_EVENT, receive);
    return () => {
      window.removeEventListener(WELCOME_INPUT_EVENT, receive);
      clearTimeout(expiry);
    };
  }, [enter]);

  const still = paused || reduced || entering;
  const trackingLine = entering
    ? "Hello, friend. Opening the plaza."
    : tracking === "ready"
      ? "Hand detected · Wave back or high-five to enter"
      : tracking === "searching"
        ? "Hand controls connected · Show your hand to the sensor"
        : "Hand controls not connected · You can still enter with the button";

  return (
    <main className={`${styles.screen} ${entering ? styles.entering : ""}`} data-testid="welcome">
      <header className={styles.topbar}>
        <span className={styles.label}>A LITTLE HELLO. A LOT OF POSSIBILITY.</span>
        {!imageFailed && (
          <button
            type="button"
            className={styles.motion}
            data-hand-target="welcome-motion"
            onClick={() => setPaused((was) => !was)}
            disabled={reduced || entering}
            aria-pressed={paused || reduced}
          >
            {reduced ? "Reduced motion on" : paused ? "Play wave" : "Pause wave"}
          </button>
        )}
      </header>
      <section className={styles.center} aria-labelledby="welcome-title">
        <h1 id="welcome-title" className={styles.srOnly} tabIndex={-1} ref={heading}>
          Affinity. Wave hello to begin.
        </h1>
        <div className={styles.art}>
          {!imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- animated GIF artwork; next/image would freeze it.
            <img
              src={`${ART}${still ? "affinity-welcome-center-v1.png" : "affinity-welcome-wave-v1.gif"}`}
              width={1536}
              height={1024}
              alt="Theo leans toward you with a raised high-five palm. Mira and Pip wave beside him."
              fetchPriority="high"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className={styles.fallback}>
              <strong>Affinity</strong>
              <p>Your family is waiting.</p>
            </div>
          )}
          {!imageFailed && (
            <button
              type="button"
              className={styles.palm}
              aria-label="High-five Theo and enter the plaza"
              title="High-five Theo"
              onClick={enter}
              disabled={entering}
              data-hand-target="welcome-palm"
            >
              <span className={styles.palmLabel} aria-hidden>
                {entering ? "High five!" : "Tap to high-five"}
              </span>
            </button>
          )}
        </div>
        <div className={styles.actions}>
          <p className={styles.invitation}>Good company starts with a hello.</p>
          <button type="button" className={styles.enter} onClick={enter} disabled={entering} data-hand-target="welcome-enter">
            {entering ? "See you in the plaza…" : "Enter plaza"}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </button>
          <p className={styles.hint}>{imageFailed ? "Use the button to step inside." : "Or use the button."}</p>
          <p className={`${styles.tracking} ${styles[tracking]}`} role="status" aria-live="polite">
            <span aria-hidden />
            {trackingLine}
          </p>
        </div>
      </section>
      <footer className={styles.bottom}>
        <span>YOUR PEOPLE. YOUR LITTLE PLAZA.</span>
        <span>Made for moments together.</span>
      </footer>
    </main>
  );
}
