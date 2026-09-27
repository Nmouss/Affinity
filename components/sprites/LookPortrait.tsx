import type { CharacterLook } from "@/types/character";
import styles from "./LookPortrait.module.css";

/** The character as a friendly circle: body color fill, accent ring, face patch, two eyes. */
export function LookPortrait({ look, size = "md", className }: { look: CharacterLook; size?: "md" | "lg"; className?: string }) {
  return (
    <span
      className={[styles.portrait, size === "lg" ? styles.large : "", className ?? ""].filter(Boolean).join(" ")}
      style={{ background: look.bodyColor, borderColor: look.accent }}
      aria-hidden
    >
      <span className={styles.face} style={{ background: look.skin }}>
        <span className={styles.eye} style={{ background: look.eyes.color }} />
        <span className={styles.eye} style={{ background: look.eyes.color }} />
      </span>
    </span>
  );
}
