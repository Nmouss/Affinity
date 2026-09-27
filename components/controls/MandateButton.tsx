"use client";

import React, { useEffect, useRef, useState } from "react";
import { MANDATE_HAND_TARGET } from "@/components/hands/makerHandshake";
import { handTarget } from "@/components/hands/makerHitTest";
import { setHandshakeAssist } from "@/lib/gestures/live";
import { isArmed, onGesture } from "@/lib/stage/bus";
import { useStage } from "@/lib/stage/store";
import styles from "./MandateButton.module.css";

/** How the handshake gesture is armed while this button is mounted. */
const ARMED_GESTURE = "handshakeComplete" as const;

/** Poll interval while waiting for the director to arm the handshake (see lib/director/arming.ts's
 *  BUNDLE_SETTLE_MS). isArmed() is a plain function, not a store selector, so nothing re-renders us
 *  when the settle timer alone elapses; a short poll picks that up without needing a store change. */
const ARM_POLL_MS = 200;

/** Pure: what the button should say. Once armed it shows the caller's label; before that, holding
 *  would silently do nothing (the gesture bus rejects it), so say so instead. */
export function mandateLabel(label: string, armed: boolean): string {
  return armed ? label : "Settling…";
}

/** Pure: whether the button should accept a hold right now. */
export function mandateInteractive(disabled: boolean, armed: boolean): boolean {
  return !disabled && armed;
}

/**
 * Hold-to-approve for mouse and touch. Holding feeds the same handshake meter as the hand and Space,
 * so it fills the same ring and emits the same handshakeProgress / handshakeComplete events.
 * `onApprove` runs after any completed handshake while this button is mounted.
 *
 * The director only arms the handshake once the current bundle/plan has settled (BUNDLE_SETTLE_MS in
 * lib/director/arming.ts). Before that, the button shows a "Settling…" state instead of accepting a
 * hold that the gesture bus would just drop.
 */
export function MandateButton({
  onApprove,
  label = "Hold Space or shake hands to approve",
  disabled = false,
  plaza = false,
}: {
  onApprove?: () => void;
  label?: string;
  disabled?: boolean;
  plaza?: boolean;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const approve = useRef(onApprove);
  const [armed, setArmed] = useState(() => isArmed(ARMED_GESTURE));

  useEffect(() => {
    approve.current = onApprove;
  }, [onApprove]);

  // Progress changes every frame while held, so it goes straight to a CSS variable, not React state.
  useEffect(
    () =>
      useStage.subscribe((state) => {
        button.current?.style.setProperty("--progress", String(state.hand.handshakeProgress));
      }),
    [],
  );

  useEffect(
    () =>
      onGesture((event) => {
        if (event.type === "handshakeComplete") approve.current?.();
      }),
    [],
  );

  // Poll the arming policy until it opens; BUNDLE_SETTLE_MS elapses on a timer, not a store event, so
  // a plain effect dependency wouldn't notice it.
  useEffect(() => {
    if (armed) return;
    setArmed(isArmed(ARMED_GESTURE));
    const id = window.setInterval(() => setArmed(isArmed(ARMED_GESTURE)), ARM_POLL_MS);
    return () => window.clearInterval(id);
  }, [armed]);

  const interactive = mandateInteractive(disabled, armed);

  useEffect(() => {
    if (!interactive) setHandshakeAssist("button", false);
    return () => setHandshakeAssist("button", false);
  }, [interactive]);

  const release = () => setHandshakeAssist("button", false);

  return (
    <button
      ref={button}
      type="button"
      className={`${styles.button} ${plaza ? styles.plaza : ""}`}
      disabled={!interactive}
      {...handTarget(MANDATE_HAND_TARGET)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        // Belt-and-suspenders: the disabled attribute already blocks this while unarmed, but the
        // poll above can lag the director's policy by up to ARM_POLL_MS.
        if (!isArmed(ARMED_GESTURE)) {
          useStage.getState().setError("Still settling — try approval again in a moment.");
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        setHandshakeAssist("button", true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className={styles.fill} aria-hidden="true" />
      <span className={styles.label}>{mandateLabel(label, armed)}</span>
    </button>
  );
}
