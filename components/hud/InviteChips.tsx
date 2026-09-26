"use client";

import { emitGesture } from "@/lib/stage/bus";
import { FAMILY } from "@/lib/stage/slices/council";
import { useStage } from "@/lib/stage/store";
import styles from "./InviteChips.module.css";

/** DOM twin of pinch-dragging sprites into the ring, so the lobby also works with Tab and Enter. */
export function InviteChips() {
  const sprites = useStage((state) => state.sprites);
  const profileOpenId = useStage((state) => state.profileOpenId);

  return (
    <ul className={styles.chips} aria-label="Invite family sprites to the council">
      {FAMILY.map((profile, index) => {
        const seat = sprites[profile.id]?.seat ?? null;
        const seated = seat !== null;
        return (
          <li key={profile.id} className={seated ? styles.seated : styles.chip} style={{ borderColor: profile.colors[0] }}>
            <button
              type="button"
              className={styles.toggle}
              aria-pressed={seated}
              onClick={() =>
                emitGesture(seated ? { type: "dragEnd", spriteId: profile.id, seat: null } : { type: "seat", spriteId: profile.id })
              }
            >
              <span className={styles.dot} style={{ background: profile.colors[0] }} aria-hidden />
              {profile.name}
              <span className={styles.kbd}>{index + 1}</span>
            </button>
            <button
              type="button"
              className={styles.info}
              aria-label={`${profile.name}'s profile`}
              aria-pressed={profileOpenId === profile.id}
              onClick={() => emitGesture({ type: "pinchTap", target: `sprite:${profile.id}` })}
            >
              i
            </button>
          </li>
        );
      })}
    </ul>
  );
}
