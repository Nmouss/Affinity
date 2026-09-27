"use client";

import { useCircle } from "@/lib/people/roster";
import { emitGesture } from "@/lib/stage/bus";
import { useStage } from "@/lib/stage/store";
import type { FamilyProfile } from "@/types/domain";
import styles from "./InviteChips.module.css";

function Chip({
  profile,
  keyNumber,
  seated,
  profileOpenId,
}: {
  profile: FamilyProfile;
  /** 1..6 for the first six chips in roster order (family, then friends); null past that. */
  keyNumber: number | null;
  seated: boolean;
  profileOpenId: string | null;
}) {
  return (
    <li className={seated ? styles.seated : styles.chip} style={{ borderColor: profile.colors[0] }}>
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
        {keyNumber !== null && <span className={styles.kbd}>{keyNumber}</span>}
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
}

/**
 * DOM twin of pinch-dragging sprites into the ring, so the lobby also works with Tab and Enter.
 * Two rows — family, then friends (the friends row only appears once there are any) — matching the
 * number keys' order: Digit1..6 seat family first, then friends (lib/gestures/keyboard.ts).
 */
export function InviteChips() {
  const family = useCircle("family");
  const friends = useCircle("friend");
  const sprites = useStage((state) => state.sprites);
  const profileOpenId = useStage((state) => state.profileOpenId);

  const seatOf = (id: string) => sprites[id]?.seat ?? null;
  const keyFor = (index: number) => (index < 6 ? index + 1 : null);

  return (
    <div className={styles.rows}>
      <ul className={styles.chips} aria-label="Invite family to the council">
        {family.map((profile, index) => (
          <Chip
            key={profile.id}
            profile={profile}
            keyNumber={keyFor(index)}
            seated={seatOf(profile.id) !== null}
            profileOpenId={profileOpenId}
          />
        ))}
      </ul>
      {friends.length > 0 && (
        <ul className={styles.chips} aria-label="Invite friends to the council">
          {friends.map((profile, index) => (
            <Chip
              key={profile.id}
              profile={profile}
              keyNumber={keyFor(family.length + index)}
              seated={seatOf(profile.id) !== null}
              profileOpenId={profileOpenId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
