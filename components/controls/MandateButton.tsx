"use client";

import { useEffect, useRef } from "react";
import { setHandshakeAssist } from "@/lib/gestures/live";
import { onGesture } from "@/lib/stage/bus";
import { useStage } from "@/lib/stage/store";
import styles from "./MandateButton.module.css";

/**
 * Hold-to-approve for mouse and touch. Holding feeds the same handshake meter as the hand and Space,
 * so it fills the same ring and emits the same handshakeProgress / handshakeComplete events.
 * `onApprove` runs after any completed handshake while this button is mounted.
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

  useEffect(() => {
    if (disabled) setHandshakeAssist("button", false);
    return () => setHandshakeAssist("button", false);
  }, [disabled]);

  const release = () => setHandshakeAssist("button", false);

  return (
    <button
      ref={button}
      type="button"
      className={`${styles.button} ${plaza ? styles.plaza : ""}`}
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setHandshakeAssist("button", true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className={styles.fill} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </button>
  );
}
