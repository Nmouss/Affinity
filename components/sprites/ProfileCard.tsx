"use client";

import { useEffect } from "react";
import type { FamilyProfile, HouseRule } from "@/types/domain";
import styles from "./ProfileCard.module.css";

function ruleText(rule: HouseRule): string {
  return rule.type === "maxHeight" ? `Nothing taller than ${rule.inches ?? "?"} in` : `No ${rule.tag ?? "?"}`;
}

/** A sprite's profile: the only thing its agent knows. Closes on Escape (a pinch elsewhere closes it too). */
export function ProfileCard({ profile, onClose }: { profile: FamilyProfile; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [primary, secondary] = profile.colors;
  return (
    <aside className={styles.card} aria-label={`${profile.name}'s profile`} style={{ borderColor: primary }}>
      <header className={styles.header}>
        <span
          className={styles.orb}
          style={{ background: `radial-gradient(circle at 35% 30%, ${secondary ?? "#fff"}, ${primary ?? "#ffd18a"})` }}
          aria-hidden
        />
        <div>
          <h2 className={styles.name}>{profile.name}</h2>
          <p className={styles.relationship}>
            {profile.relationship} · {profile.personality.join(", ")}
          </p>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close profile">
          Esc
        </button>
      </header>
      <section>
        <h3 className={styles.sub}>Loves</h3>
        <ul className={styles.chips}>
          {profile.loves.map((love) => (
            <li key={love} className={styles.love}>
              {love}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className={styles.sub}>Avoids</h3>
        <ul className={styles.chips}>
          {profile.avoids.map((avoid) => (
            <li key={avoid} className={styles.avoid}>
              {avoid}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className={styles.sub}>House rules</h3>
        {profile.houseRules.length === 0 ? (
          <p className={styles.none}>None of their own</p>
        ) : (
          <ul className={styles.rules}>
            {profile.houseRules.map((rule, index) => (
              <li key={index}>
                <strong>{ruleText(rule)}</strong> <span className={styles.why}>{rule.why}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
